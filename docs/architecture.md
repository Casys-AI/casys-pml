# Decision Architecture - AgentCards

## Executive Summary

AgentCards est un MCP gateway intelligent qui optimise le contexte LLM (<5% vs 30-50%) et parallélise l'exécution des workflows (5x speedup) via vector search sémantique et DAG execution. L'architecture repose sur Deno 2+ pour la runtime, PGlite (PostgreSQL WASM) avec pgvector pour le vector search HNSW, et une implémentation custom du DAG executor. Le système est zero-config, portable (single-file database), et supporte 15+ MCP servers simultanément.

## Project Initialization

**First Story (1.1):** Initialize project using Deno's official tooling:

```bash
deno init agentcards
cd agentcards
```

**What This Provides:**
- `deno.json` - Configuration file with tasks, imports, and compiler options
- `main.ts` - Entry point template
- `main_test.ts` - Testing setup with Deno.test
- Standard Deno conventions: TypeScript by default, ES modules

**Deno Version:** 2.5 (latest) / 2.2 (LTS)

**Additional Setup Required:**
- CLI structure (commands: init, serve, status) via cliffy
- Project organization (src/, tests/, docs/)
- Dependencies centralization (deps.ts pattern)
- PGlite database initialization

---

## Decision Summary

| Category | Decision | Version | Affects Epics | Rationale |
| -------- | -------- | ------- | ------------- | --------- |
| Runtime | Deno | 2.5 / 2.2 LTS | Epic 1, Epic 2 | PROVIDED BY INIT - TypeScript native, secure by default, npm compat |
| Database | PGlite | 0.3.11 | Epic 1 | Embedded PostgreSQL WASM, portable single-file, 3MB footprint |
| Vector Search | pgvector (HNSW) | Built-in PGlite | Epic 1 | Production-ready ANN search, <100ms P95, supports cosine/L2/IP |
| Embeddings | @huggingface/transformers | 3.7.6 | Epic 1 | BGE-Large-EN-v1.5 local inference, Deno compatible, 1024-dim vectors, v3 with WebGPU |
| MCP Protocol | @modelcontextprotocol/sdk | 1.21.1 | Epic 1, Epic 2 | Official TypeScript SDK, 10.5k stars, stdio + SSE transport |
| CLI Framework | cliffy | 1.0.0-rc.8 | Epic 1 | Type-safe args parsing, auto-help, shell completions, Deno-first (JSR) |
| Configuration | @std/yaml | 1.0.5 | Epic 1 | Standard YAML parsing for config.yaml (JSR stable) |
| Logging | @std/log | 0.224.14 | Epic 1 | Structured logging with levels (JSR, UNSTABLE) |
| DAG Execution | Custom (zero deps) | N/A | Epic 2 | Topological sort + Promise.all, no external dependency |
| Graph Algorithms | graphology | 0.26.0 | Epic 2 | True PageRank, Louvain, bidirectional search - "NetworkX of JavaScript" |
| SSE Streaming | Native ReadableStream | Deno built-in | Epic 2 | Server-Sent Events for progressive results |
| Process Management | Deno.Command | Deno built-in | Epic 1 | stdio subprocess for MCP server communication |
| Testing | Deno.test | Deno built-in | Epic 1, Epic 2 | Native testing + benchmarks, >80% coverage target |
| HTTP Server | Deno.serve | Deno 2+ built-in | Epic 2 | Modern HTTP server API for gateway (if needed) |

---

## Version Verification

**Last Verified:** 2025-11-13
**Method:** WebSearch + npm registry + Deno Land + JSR

All versions have been verified against their official registries to ensure:
- Current stability status (stable, RC, beta)
- Breaking changes between versions
- Deno compatibility
- Production readiness

| Technology | Version | Registry | Status | Notes |
|------------|---------|----------|--------|-------|
| Deno | 2.5 / 2.2 LTS | deno.com | Stable | LTS (2.2) recommended for production |
| PGlite | 0.3.11 | npm | Stable | Electric SQL, production-ready |
| @huggingface/transformers | 3.7.6 | npm | Stable | v3 released Oct 2024, WebGPU support, Deno compatible |
| @modelcontextprotocol/sdk | 1.21.1 | npm | Stable | Published recently, 16k+ dependents, active development |
| cliffy | 1.0.0-rc.8 | JSR | RC | Latest stable RC on JSR (July 2024) |
| @std/yaml | 1.0.5 | JSR | Stable | Stable 1.x on JSR, production-ready |
| @std/log | 0.224.14 | JSR | Unstable | Still 0.x (UNSTABLE), deprecation warning for OpenTelemetry |
| graphology | 0.26.0 | npm | Stable | Published April 2024, mature library, 138+ dependents |

**Version Strategy:**
- **Deno Runtime:** Use 2.2 (LTS) for production stability, 2.5 for latest features
- **cliffy:** Using JSR version rc.8 (latest stable RC, deno.land rc.4 deprecated)
- **Deno std packages:** Migrated to JSR with independent versioning
  - @std/yaml: 1.0.5 (stable 1.x)
  - @std/log: 0.224.14 (still unstable 0.x, future deprecation noted)
- **npm packages:** All latest stable versions verified for Deno compatibility
- **@huggingface/transformers:** Using v3 (3.7.6) with WebGPU support, breaking change from v2

**Breaking Changes Review:**
- **@huggingface/transformers 2.x → 3.x:** Major version bump, package moved to @huggingface org, WebGPU support added
- **@std packages:** Now on JSR with independent versions (no longer bundled)
- **@std/log:** Marked UNSTABLE with future migration to OpenTelemetry recommended
- **cliffy:** Using JSR (rc.8), deno.land versions rc.6/rc.7 are broken, use JSR exclusively
- **PGlite 0.3.11:** Stable, no breaking changes expected before 0.4.x

---

## Project Structure

```
agentcards/
├── deno.json                    # Deno config, tasks, imports
├── deps.ts                      # Centralized dependencies
├── mod.ts                       # Public API exports
├── main.ts                      # CLI entry point
│
├── src/
│   ├── cli/                     # CLI commands (Epic 1)
│   │   ├── commands/
│   │   │   ├── init.ts          # Story 1.7 - Migration tool
│   │   │   ├── serve.ts         # Story 2.4 - Gateway server
│   │   │   └── status.ts        # Story 2.5 - Health checks
│   │   └── main.ts              # cliffy CLI setup
│   │
│   ├── db/                      # Database layer (Epic 1)
│   │   ├── client.ts            # PGlite initialization
│   │   ├── migrations/          # SQL schema evolution
│   │   │   └── 001_initial.sql  # Story 1.2 - Initial schema
│   │   └── queries.ts           # Prepared queries
│   │
│   ├── vector/                  # Vector search (Epic 1)
│   │   ├── embeddings.ts        # Story 1.4 - BGE model inference
│   │   ├── search.ts            # Story 1.5 - Semantic search
│   │   └── index.ts             # HNSW index management
│   │
│   ├── mcp/                     # MCP protocol (Epic 1, 2, 3)
│   │   ├── discovery.ts         # Story 1.3 - Server discovery
│   │   ├── client.ts            # MCP SDK wrapper
│   │   ├── gateway-server.ts    # Story 2.4 - Gateway server
│   │   └── types.ts             # MCP type definitions
│   │
│   ├── dag/                     # DAG execution (Epic 2, 2.5)
│   │   ├── builder.ts           # Story 2.1 - Dependency graph
│   │   ├── executor.ts          # Story 2.2 - Parallel execution
│   │   ├── controlled-executor.ts # Story 2.5-1 - Adaptive executor
│   │   ├── state.ts             # Story 2.5-1 - WorkflowState
│   │   ├── event-stream.ts      # Story 2.5-1 - Event streaming
│   │   ├── command-queue.ts     # Story 2.5-1 - Command queue
│   │   ├── checkpoint-manager.ts # Story 2.5-2 - Checkpoints
│   │   └── types.ts             # DAG node/edge types
│   │
│   ├── graphrag/                # GraphRAG (Epic 2.5)
│   │   ├── engine.ts            # Story 2.5-3 - Graph engine
│   │   ├── dag-suggester.ts     # Story 2.5-3 - DAG replanning
│   │   └── types.ts             # Graph types
│   │
│   ├── sandbox/                 # Code execution (Epic 3) 🆕
│   │   ├── executor.ts          # Story 3.1 - Deno sandbox
│   │   ├── context-builder.ts   # Story 3.2 - Tool injection
│   │   └── types.ts             # Story 3.1 - Sandbox types
│   │
│   ├── streaming/               # SSE streaming (Epic 2)
│   │   ├── sse.ts               # Story 2.3 - Event stream
│   │   └── types.ts             # Event types
│   │
│   ├── config/                  # Configuration (Epic 1)
│   │   ├── loader.ts            # YAML config loading
│   │   ├── validator.ts         # Config schema validation
│   │   └── types.ts             # Config interfaces
│   │
│   ├── telemetry/               # Observability (Epic 1)
│   │   ├── logger.ts            # Story 1.8 - std/log wrapper
│   │   ├── metrics.ts           # Context/latency tracking
│   │   └── types.ts             # Metric definitions
│   │
│   └── utils/                   # Shared utilities
│       ├── errors.ts            # Story 2.6 - Custom error types
│       ├── retry.ts             # Retry logic with backoff
│       └── validation.ts        # Input validation helpers
│
├── tests/                       # Test suite
│   ├── unit/                    # Unit tests
│   ├── integration/             # Integration tests
│   ├── e2e/                     # Story 2.7 - E2E scenarios
│   ├── benchmarks/              # Performance tests
│   └── fixtures/                # Mock data, MCP servers
│
├── docs/                        # Documentation
│   ├── architecture.md          # This file
│   ├── PRD.md                   # Product requirements
│   ├── epics.md                 # Epic breakdown
│   └── api/                     # API documentation
│
└── .agentcards/                 # User data directory (created at runtime)
    ├── config.yaml              # User configuration
    ├── agentcards.db            # PGlite database file
    └── logs/                    # Application logs
        └── agentcards.log
```

---

## Epic to Architecture Mapping

| Epic | Module | Key Components | Stories | Status |
|------|--------|----------------|---------|--------|
| **Epic 1: Foundation & Context Optimization** | `src/db/`, `src/vector/`, `src/mcp/`, `src/cli/`, `src/telemetry/` | PGlite client, Vector search, Embeddings, MCP discovery, Migration tool | 1.1-1.8 | ✅ DONE |
| **Epic 2: DAG Execution & Production** | `src/dag/`, `src/streaming/`, `src/mcp/gateway.ts`, `tests/e2e/` | DAG builder, Parallel executor, SSE streaming, MCP gateway, Health checks | 2.1-2.7 | ✅ DONE |
| **Epic 2.5: Adaptive DAG Feedback Loops** | `src/dag/controlled-executor.ts`, `src/dag/state.ts`, `src/graphrag/` | ControlledExecutor, EventStream, CommandQueue, WorkflowState, Checkpoints, AIL/HIL, DAGSuggester | 2.5-1 to 2.5-3 | ✅ DONE |
| **Epic 3: Agent Code Execution & Local Processing** | `src/sandbox/` | DenoSandboxExecutor, ContextBuilder, execute_code MCP tool, Safe-to-fail pattern | 3.1-3.8 | 🟡 IN PROGRESS |

**Boundaries:**
- **Epic 1** delivers: Standalone context optimization (vector search functional, <5% context)
- **Epic 2** builds on: Epic 1 complete, adds DAG parallelization + production hardening
- **Epic 2.5** extends: Epic 2 with adaptive feedback loops (AIL/HIL, checkpoints, replanning)
- **Epic 3** extends: Epic 2.5 with code execution in sandbox (safe-to-fail, local processing)

**Epic 3 Implementation Status:**
- ✅ Story 3.1: DenoSandboxExecutor (subprocess isolation, timeout, memory limits) - DONE
- ✅ Story 3.2: MCP Tools Injection (vector search, type-safe wrappers) - REVIEW
- ⏳ Story 3.4: execute_code MCP tool (DAG integration, checkpoint compatibility) - READY FOR DEV
- ⚠️ Story 3.3: Local Data Processing Pipeline - SCOPE CLARIFICATION NEEDED (likely skip/defer)
- 📋 Stories 3.5-3.8: PII detection, caching, E2E tests, security hardening - DRAFTED/BACKLOG

---

## Technology Stack Details

### Core Technologies

**Runtime Environment:**
- Deno 2.5 (latest) or 2.2 (LTS)
- TypeScript 5.7+ (via Deno)
- ES2022 target

**Database & Vector Search:**
- PGlite 0.3.11 (PostgreSQL 17 WASM)
- pgvector extension (HNSW index)
- IndexedDB persistence (browser) / Filesystem (Deno)

**ML & Embeddings:**
- @huggingface/transformers 2.17.2
- BGE-Large-EN-v1.5 model (1024-dim embeddings)
- ONNX Runtime (WASM backend)

**MCP Integration:**
- @modelcontextprotocol/sdk (official)
- stdio transport (primary)
- SSE transport (optional)

### Integration Points

**External Systems:**
- **MCP Servers (15+):** stdio subprocess via `Deno.Command`
- **Claude Code:** Reads `~/.config/Claude/claude_desktop_config.json`
- **File System:** Config in `~/.agentcards/`, logs, database

**Internal Communication:**
- CLI → DB: PGlite SQL queries
- CLI → Vector: Semantic search API
- Gateway → MCP Servers: stdio protocol
- Executor → Tools: Async function calls
- Streaming → Client: SSE events

---

## Novel Pattern Designs

### Pattern 1: DAG Builder with JSON Schema Dependency Detection

**Problem:** Automatically detect dependencies between MCP tools to enable parallel execution without manual dependency specification.

**Challenge:** MCP tools expose input/output schemas as JSON Schema. Need to infer which outputs feed into which inputs semantically.

**Solution Architecture:**

**Components:**
1. **Schema Analyzer** (`dag/builder.ts`)
   - Parses JSON Schema for each tool
   - Extracts parameter names and types
   - Identifies required vs optional parameters

2. **Dependency Detector**
   - Matches output property names to input parameter names (string matching)
   - Type compatibility check (string → string, object → object, etc.)
   - Builds directed edge if `tool_A.output.property` matches `tool_B.input.param`

3. **DAG Constructor**
   - Nodes: Tool invocations with inputs
   - Edges: Data flow dependencies
   - Cycle detection (invalid DAG → error)
   - Topological sort for execution order

**Data Flow:**
```typescript
// Example: 3 tools workflow
Tool A (filesystem:read) → output: { content: string }
Tool B (json:parse)      → input: { jsonString: string }, output: { parsed: object }
Tool C (github:create)   → input: { data: object }

// Detected dependencies:
A.output.content → B.input.jsonString  (string → string match)
B.output.parsed  → C.input.data        (object → object match)

// DAG:
A → B → C (sequential execution required)
```

**Implementation Guide for Agents:**

```typescript
interface DAGNode {
  toolId: string;
  inputs: Record<string, unknown>;
  dependencies: string[]; // Tool IDs this node depends on
}

interface DAGEdge {
  from: string;  // Source tool ID
  to: string;    // Target tool ID
  dataPath: string; // e.g., "output.content → input.jsonString"
}

// Story 2.1 AC: Custom topological sort (no external deps)
function buildDAG(tools: Tool[]): { nodes: DAGNode[], edges: DAGEdge[] } {
  // 1. Analyze schemas
  // 2. Detect dependencies via name/type matching
  // 3. Construct graph
  // 4. Validate (no cycles)
  // 5. Topological sort
}
```

**Edge Cases:**
- No dependencies → All tools run in parallel
- Partial dependencies → Mixed parallel/sequential
- Circular dependencies → Reject workflow, return error
- Ambiguous matches → Conservative (assume dependency)

**Affects Epics:** Epic 2 (Story 2.1, 2.2)

---

### Pattern 2: Context Budget Management

**Problem:** Maintain <5% context consumption while supporting 15+ MCP servers dynamically.

**Solution:**

**Context Budget Tracker:**
```typescript
interface ContextBudget {
  totalTokens: number;      // LLM context window (e.g., 200k)
  budgetTokens: number;     // Allocated for tool schemas (5% = 10k)
  usedTokens: number;       // Currently loaded schemas
  availableTokens: number;  // Remaining budget
}

// Dynamic loading strategy
function loadTools(query: string, budget: ContextBudget): Tool[] {
  const candidates = vectorSearch(query, topK = 20);

  const selected: Tool[] = [];
  let tokens = 0;

  for (const tool of candidates) {
    const toolTokens = estimateTokens(tool.schema);
    if (tokens + toolTokens <= budget.availableTokens) {
      selected.push(tool);
      tokens += toolTokens;
    } else {
      break; // Budget exhausted
    }
  }

  return selected;
}
```

**Affects Epics:** Epic 1 (Story 1.6)

---

### Pattern 3: Speculative Execution with GraphRAG (THE Feature)

**Problem:** Reduce latency by executing workflows optimistically before Claude responds, when confidence is high enough.

**Vision:** The gateway should perform actions BEFORE Claude's call, not just suggest them. Have results ready immediately when user confirms.

**Solution Architecture:**

**Components:**

1. **GraphRAG Engine** (`dag/builder.ts`)
   - Uses Graphology for true graph algorithms (not pseudo-SQL)
   - PageRank for tool importance ranking
   - Louvain community detection for related tools
   - Bidirectional shortest path for dependency chains
   - Hybrid: PGlite stores edges, Graphology computes metrics

2. **Three Execution Modes**
   - `explicit_required` (confidence < 0.70): No pattern found, Claude must provide explicit workflow
   - `suggestion` (0.70-0.85): Good pattern found, suggest DAG to Claude
   - `speculative_execution` (>0.85): High confidence, execute immediately and have results ready

3. **Adaptive Threshold Learning**
   - Start conservative (0.92 threshold)
   - Track success rates over 50-100 executions
   - Adjust thresholds based on user acceptance patterns
   - Target: >95% success rate, <10% waste

4. **Safety Checks**
   - Never speculate on dangerous operations (delete, deploy, payment, send_email)
   - Cost/resource limits (<$0.10 estimated cost, <5s execution time)
   - Graceful fallback to suggestion mode on failure

**Data Flow:**

```typescript
// User Intent → Gateway Handler
const intent = {
  naturalLanguageQuery: "Read all JSON files and create a summary report"
};

// Step 1: Vector search + GraphRAG suggestion
const suggestion = await suggester.suggestDAG(intent);
// { confidence: 0.92, dagStructure: {...}, explanation: "..." }

// Step 2: Mode determination
if (suggestion.confidence >= 0.85 && !isDangerous(suggestion.dagStructure)) {
  // 🚀 SPECULATIVE: Execute optimistically
  const results = await executor.execute(suggestion.dagStructure);

  return {
    mode: "speculative_execution",
    results: results,  // Already executed!
    confidence: 0.92,
    note: "✨ Results prepared speculatively - ready immediately"
  };
}

// Step 3: Claude sees completed results in <300ms (vs 2-5s sequential execution)
```

**Graphology Integration:**

```typescript
import Graph from "npm:graphology";
import { pagerank } from "npm:graphology-metrics/centrality/pagerank";
import { louvain } from "npm:graphology-communities-louvain";
import { bidirectional } from "npm:graphology-shortest-path/bidirectional";

export class GraphRAGEngine {
  private graph: Graph;
  private pageRanks: Record<string, number> = {};

  async syncFromDatabase(): Promise<void> {
    // Load tool nodes and dependency edges from PGlite
    // Compute PageRank, communities
    this.pageRanks = pagerank(this.graph, { weighted: true });
  }

  findDependencyPath(from: string, to: string): string[] | null {
    return bidirectional(this.graph, from, to);
  }

  suggestWorkflow(intent: WorkflowIntent): SuggestedDAG {
    // Use vector search + graph metrics to suggest optimal DAG
    // PageRank = tool importance
    // Communities = related tools cluster
    // Paths = dependency chains
  }
}
```

**Performance Targets:**

- Graph sync from DB: <50ms
- PageRank computation: <100ms
- Shortest path query: <1ms
- Total suggestion time: <200ms
- Speculative execution: <300ms (4-5x faster than sequential)

**Database Schema:**

```sql
-- Simple storage, Graphology does the computation
CREATE TABLE tool_dependency (
  from_tool_id TEXT,
  to_tool_id TEXT,
  observed_count INTEGER,
  confidence_score REAL,
  PRIMARY KEY (from_tool_id, to_tool_id)
);

-- 90% simpler than recursive CTEs approach
-- Let Graphology handle PageRank, Louvain, paths
```

**Explainability:**

When Claude asks "why this DAG?", extract dependency paths:

```typescript
const explanation = {
  directDependencies: ["filesystem:read → json:parse"],
  transitiveDependencies: [
    "filesystem:read → json:parse → github:create (2 hops)"
  ],
  pageRankScores: {
    "filesystem:read": 0.15,
    "json:parse": 0.12
  }
};
```

**Edge Cases:**

- Dangerous operations → Always fall back to suggestion mode with warning
- Low confidence (0.70-0.85) → Suggestion mode, let Claude decide
- Very low confidence (<0.70) → Explicit workflow required
- Speculative execution fails → Return error, fall back to suggestion

**Key Benefits:**

- **Latency:** 0ms perceived wait (results ready when user confirms)
- **Context savings:** Still applies ($5-10/day >> $0.50 waste)
- **User experience:** Feels instantaneous vs 2-5s sequential execution
- **Safety:** Multiple guardrails prevent dangerous speculation

**Affects Epics:** Epic 2 (Story 2.1 - GraphRAG + Speculative Execution)

**Design Philosophy:** Speculative execution is THE feature - the core differentiator. Not optional, not opt-in. Default mode with smart safeguards.

---

### Pattern 4: 3-Loop Learning Architecture (Adaptive DAG Feedback Loops)

> **⚠️ UPDATE 2025-11-24:** AIL/HIL implementation details updated. See **ADR-019: Two-Level AIL Architecture** for MCP-compatible approach using HTTP response pattern (not SSE streaming). Story 2.5-3 SSE pattern incompatible with MCP one-shot protocol.

**Problem:** Enable truly adaptive workflows that learn and improve over time through agent-in-the-loop (AIL) and human-in-the-loop (HIL) decision points, with dynamic re-planning and continuous meta-learning.

**Vision:** Three distinct learning loops operating at different timescales:
- **Loop 1 (Execution):** Real-time workflow execution with event streaming (milliseconds)
- **Loop 2 (Adaptation):** Runtime decision-making and DAG replanning (seconds-minutes)
- **Loop 3 (Meta-Learning):** Continuous improvement of the knowledge graph (per-workflow)

**Challenge:** Current DAG executor runs linearly without:
- Agent decision points (AIL) - agent cannot inject new tools based on discoveries
- Human approval checkpoints (HIL) - no way to pause for confirmation
- Multi-turn state persistence - conversations don't survive across turns
- Dynamic DAG modification - cannot add/remove nodes during execution
- GraphRAG re-planning - no feedback loop to improve suggestions
- Adaptive learning - no mechanism to learn optimal patterns over time

**Critical Distinction: Knowledge Graph vs Workflow Graph**

⚠️ **Two Separate Concepts:**

**GraphRAG (Knowledge Graph)** = Permanent knowledge base
- **Nodes:** Available tools in the system (e.g., `filesystem:read`, `json:parse`)
- **Edges:** Relationships between tools (co-occurrence, dependencies, success patterns)
- **Storage:** PGlite (persistent database)
- **Algorithms:** PageRank, Louvain, vector search
- **Purpose:** Source of truth for tool suggestions
- **Managed by:** `GraphRAGEngine` (src/graphrag/graph-engine.ts)
- **Updates:** Learns from every workflow execution

**DAG (Workflow Execution Graph)** = Ephemeral execution plan
- **Nodes:** Specific tasks to execute for THIS workflow (e.g., "read config.json", "parse it", "validate")
- **Edges:** Execution order dependencies
- **Storage:** In-memory + checkpoints (for resume)
- **Purpose:** Blueprint for current workflow only
- **Created by:** `DAGSuggester` (src/graphrag/dag-suggester.ts)
- **Lifetime:** Created → Modified during execution → Discarded after completion

**Relationship:**
```
DAGSuggester (Workflow Layer)
    ↓ queries
GraphRAGEngine (Knowledge Graph Layer)
    ↓ reads/writes
PGlite (Storage: tools, edges, embeddings)
```

---

**Solution Architecture:**

### Components:

**1. ControlledExecutor** (`src/dag/controlled-executor.ts`)
- Extends `ParallelExecutor` (zero breaking changes)
- Event stream for real-time observability
- Command queue for non-blocking control
- State management with MessagesState-inspired reducers

**2. WorkflowState with Reducers**
```typescript
interface WorkflowState {
  messages: Message[];      // Agent/human messages (reducer: append)
  tasks: TaskResult[];      // Completed tasks (reducer: append)
  decisions: Decision[];    // AIL/HIL decisions (reducer: append)
  context: Record<string, any>; // Shared context (reducer: merge)
  checkpoint_id?: string;   // Resume capability
}

// MessagesState-inspired reducers (LangGraph v1.0 pattern)
const reducers = {
  messages: (existing, update) => [...existing, ...update],
  tasks: (existing, update) => [...existing, ...update],
  decisions: (existing, update) => [...existing, ...update],
  context: (existing, update) => ({ ...existing, ...update })
};
```

**3. Event Stream** (TransformStream API)
```typescript
// Real-time observability
eventStream.emit({
  type: "task_completed",
  taskId: "parse_json",
  result: { parsed: {...} },
  timestamp: Date.now()
});

// Consumers can subscribe
executor.eventStream.subscribe((event) => {
  if (event.type === "task_completed") {
    // Agent can decide next action based on result
  }
});
```

**4. Command Queue** (AsyncQueue pattern)
```typescript
// Agent/Human inject commands
commandQueue.enqueue({
  type: "inject_tasks",
  tasks: [{ toolId: "xml:parse", inputs: {...} }]
});

// Executor processes between layers (non-blocking)
await this.processCommands();
```

**5. GraphRAG Integration** (Feedback Loop)

**⚠️ ARCHITECTURE LAYERS:**

**Layer 1: DAGSuggester** (Workflow Layer) - `src/graphrag/dag-suggester.ts`
```typescript
export class DAGSuggester {
  constructor(
    private graphEngine: GraphRAGEngine,  // Uses knowledge graph
    private vectorSearch: VectorSearch
  ) {}

  // ✅ EXISTS - Initial DAG suggestion
  async suggestDAG(intent: WorkflowIntent): Promise<SuggestedDAG | null> {
    // 1. graphEngine.vectorSearch(query) → Find relevant tools
    // 2. graphEngine.getPageRank(toolId) → Rank by importance
    // 3. graphEngine.buildDAG(toolIds) → Construct workflow DAG
  }

  // ✅ NEW METHOD - Dynamic re-planning during execution
  async replanDAG(
    currentDAG: DAGStructure,
    newContext: {
      completedTasks: TaskResult[];
      newRequirement: string;
      availableContext: Record<string, any>;
    }
  ): Promise<DAGStructure> {
    // 1. graphEngine.vectorSearch(newRequirement) → New tools
    // 2. graphEngine.findShortestPath(current, target) → Optimize path
    // 3. graphEngine.buildDAG([...existing, ...new]) → Augmented DAG
  }

  // ✅ NEW METHOD - Speculative prediction
  async predictNextNodes(
    state: WorkflowState,
    completed: TaskResult[]
  ): Promise<PredictedNode[]> {
    // 1. Analyze completed task patterns in GraphRAG
    // 2. graphEngine.findCommunityMembers(lastTool) → Tools often used after
    // 3. graphEngine.getPageRank() → Confidence score
  }
}
```

**Layer 2: GraphRAGEngine** (Knowledge Graph Layer) - `src/graphrag/graph-engine.ts`
```typescript
export class GraphRAGEngine {
  // ✅ EXISTS - Used by suggestDAG()
  async vectorSearch(query: string, k: number): Promise<Tool[]>
  getPageRank(toolId: string): number
  buildDAG(toolIds: string[]): DAGStructure

  // ✅ EXISTS - Used by replanDAG()
  findShortestPath(from: string, to: string): string[]
  findCommunityMembers(toolId: string): string[]

  // ✅ EXISTS - Feedback learning
  async updateFromExecution(execution: WorkflowExecution): Promise<void> {
    // - Extract dependencies from executed DAG
    // - Update tool co-occurrence edges in knowledge graph
    // - Recompute PageRank weights
    // - Persist to PGlite
  }
}
```

---

### Complete Feedback Loop (3 Phases):

```
┌───────────────────────────────────────────────────────────┐
│        Adaptive DAG Feedback Loop Architecture            │
└───────────────────────────────────────────────────────────┘

PHASE 1: INITIAL SUGGESTION (Knowledge → Workflow)
┌────────────┐
│   User     │ "Analyze JSON files in ./data/"
└─────┬──────┘
      │
      ▼
┌──────────────────┐
│  DAGSuggester    │ Queries knowledge graph
│  .suggestDAG()   │ → vectorSearch("analyze JSON")
└─────┬────────────┘ → PageRank ranking
      │ uses        → buildDAG()
      ▼
┌──────────────────┐
│ GraphRAGEngine   │ Knowledge graph operations
│ (Knowledge Base) │ Tools: [list_dir, read_json, analyze]
└─────┬────────────┘
      │ returns
      ▼
┌──────────────────┐
│  Workflow DAG    │ Tasks: list_dir → read_json → analyze
└─────┬────────────┘

PHASE 2: ADAPTIVE EXECUTION (Runtime Discovery & Re-planning)
      │
      ▼
┌────────────────────────────────────────┐
│      ControlledExecutor                │
│                                        │
│  Layer 1: list_dir                    │
│           └─► Discovers XML files!    │
│               │                        │
│               ▼                        │
│         AIL Decision:                  │
│         "Need XML parser too"          │
│               │                        │
│               ▼                        │
│    CommandQueue.enqueue({              │
│      type: "replan_dag",               │
│      requirement: "parse XML"          │
│    })                                  │
│               │                        │
│               ▼                        │
│    DAGSuggester.replanDAG()            │
│      → queries GraphRAG                │
│      → finds "xml:parse" tool          │
│      → returns augmented DAG           │
│               │                        │
│               ▼                        │
│    Inject new node: parse_xml          │
│                                        │
│  Layer 2: [read_json, parse_xml] NEW  │
│           └─► Both execute in parallel │
│               │                        │
│               ▼                        │
│         HIL Checkpoint:                │
│         "Approve before analyze?"      │
│         Human: "Yes, proceed"          │
│                                        │
│  Layer 3: analyze (updated context)    │
│                                        │
└────────┬───────────────────────────────┘
         │
         ▼

PHASE 3: LEARNING (Workflow → Knowledge)
┌─────────────────────────────────┐
│  GraphRAGEngine                 │
│  .updateFromExecution()         │
│                                 │
│  Updates Knowledge Graph:       │
│  ✓ Add edge: list_dir → parse_xml │
│  ✓ Strengthen: parse → analyze  │
│  ✓ Update PageRank weights      │
│  ✓ Store user preferences       │
│  ✓ Persist to PGlite            │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Enriched Knowledge Graph       │
│  Better suggestions next time!  │
└─────────────────────────────────┘

NEXT WORKFLOW: Cycle improves
  User: "Analyze data files"
      ↓
  DAGSuggester queries enriched graph
      ↓
  Suggests: [list_dir, read_json, parse_xml, analyze]
      ↓
  XML parser included proactively! ✨
```

---

### 4 Roles of GraphRAG in Feedback Loop:

**Role 1: Initial Workflow Suggestion**
- User provides intent → DAGSuggester queries GraphRAG
- Vector search finds relevant tools
- PageRank ranks by importance
- buildDAG creates initial workflow

**Role 2: Dynamic Re-planning (AIL/HIL)**
- Agent/Human discovers new requirement mid-execution
- DAGSuggester.replanDAG() re-queries GraphRAG
- Finds additional tools needed
- Injects new nodes into running DAG

**Role 3: Speculative Prediction**
- During agent thinking, predict next likely tools
- DAGSuggester.predictNextNodes() queries community members
- High confidence (>0.7) → execute speculatively
- Results ready when agent needs them (0ms latency)

**Role 4: Learning & Enrichment**
- After workflow completion, update knowledge graph
- GraphRAGEngine.updateFromExecution() stores patterns
- Tool co-occurrence edges strengthened
- PageRank recomputed with new data
- User preferences learned

---

### Integration with ControlledExecutor:

```typescript
class ControlledExecutor extends ParallelExecutor {
  private dagSuggester: DAGSuggester;      // Workflow layer
  private graphEngine: GraphRAGEngine;      // Knowledge layer
  private state: WorkflowState;
  private commandQueue: AsyncQueue<Command>;
  private eventStream: TransformStream<ExecutionEvent>;

  async executeWithControl(dag: DAGStructure, config: ExecutionConfig) {
    // Before each layer: Speculative prediction
    if (config.speculation.enabled) {
      const predictions = await this.dagSuggester.predictNextNodes(
        this.state,
        this.state.tasks
      );
      // Execute high-confidence predictions speculatively
      this.startSpeculativeExecution(predictions);
    }

    // Process commands (may include replan requests)
    await this.processCommands();

    // Execute layer with event streaming
    for (const layer of this.layers) {
      for (const task of layer) {
        const result = await this.executeTask(task);
        this.eventStream.emit({ type: "task_completed", task, result });

        // Update state with reducers
        this.updateState({ tasks: [result] });
      }
    }

    // After execution: Update knowledge graph
    await this.graphEngine.updateFromExecution({
      workflow_id: this.executionId,
      executed_dag: dag,
      execution_results: this.state.tasks,
      timestamp: new Date(),
      success: true
    });
  }

  private async handleReplanCommand(cmd: ReplanCommand) {
    // DAGSuggester re-queries GraphRAG for new tools
    const updatedDAG = await this.dagSuggester.replanDAG(
      this.currentDAG,
      {
        completedTasks: this.state.tasks,
        newRequirement: cmd.requirement,
        availableContext: this.state.context
      }
    );

    // Merge new nodes into current DAG
    this.mergeDynamicNodes(updatedDAG.newNodes);
  }
}
```

---

### Benefits:

**Immediate:**
- ✅ **Adaptive workflows:** Plans adjust in real-time based on discoveries
- ✅ **Smart predictions:** Speculation based on real usage patterns
- ✅ **Progressive discovery:** Don't need to predict everything upfront
- ✅ **Context-aware:** Suggestions consider current workflow state

**Long-term Learning:**
- ✅ **Pattern recognition:** Detects frequent tool sequences
- ✅ **User preferences:** Learns from human decisions
- ✅ **Error avoidance:** Tools that fail together → lower rank
- ✅ **Efficiency:** Optimal paths reinforced by PageRank

**Example Learning Cycle:**
```
Week 1: User often "list_dir → find XML → need parse_xml"
        → GraphRAGEngine learns pattern (updateFromExecution)
        → Edge list_dir → parse_xml added to knowledge graph

Week 2: list_dir finds XML
        → DAGSuggester queries GraphRAG
        → GraphRAG suggests parse_xml proactively (confidence 0.85)
        → Speculation executes it
        → User: "Perfect!" ✅
        → Pattern reinforced in knowledge graph

Week 3: Same scenario
        → Confidence now 0.92 (stronger edge weight)
        → Speculation happens automatically
        → 0ms perceived latency 🚀
```

---

### Checkpoint Architecture & Workflow State

**What Checkpoints Save:**

Checkpoints sauvegardent l'état complet du workflow dans PGlite :

```typescript
interface Checkpoint {
  id: string;
  workflow_id: string;
  timestamp: Date;
  layer: number;              // Current DAG layer
  state: WorkflowState;       // Complete workflow state
}

interface WorkflowState {
  workflow_id: string;
  current_layer: number;
  tasks: TaskResult[];         // Completed tasks with results
  decisions: Decision[];       // AIL/HIL decisions made
  commands: Command[];         // Pending commands
  messages: Message[];         // Multi-turn conversation
  context: Record<string, any>; // Workflow context
}
```

**What Checkpoints DON'T Save:**
- ❌ Filesystem state (modified files)
- ❌ External side-effects (API calls, DB writes)
- ❌ Code diffs or file changes

**Why This Works for Epic 2.5:**
- Epic 2.5 workflows = **orchestration primarily** (AIL/HIL decisions, GraphRAG queries, DAG replanning)
- File modifications **delegated to Epic 3** (Sandbox isolation)
- Tasks requiring file changes → **idempotence required** (documented per story)

**Resume Behavior:**
- ✅ **Read-only workflows:** Perfect resume (zero data loss)
- ⚠️ **Workflows with modifications:** Tasks re-execute (idempotency ensures safety)
- 🎯 **Epic 3 (future):** Sandbox isolation eliminates this concern entirely

---

### Context Management & Agent Architecture

**Architecture Principle:** Un seul agent en conversation continue

Epic 2.5 utilise un seul agent Claude qui exécute le DAG via ses MCP tools et prend toutes les décisions (AIL) dans sa conversation continue.

```typescript
class ControlledExecutor {
  private agent: ClaudeAgent;  // Un agent, une conversation

  async executeStream(dag: DAGStructure) {
    for (const layer of layers) {
      // Agent exécute les tasks via MCP tools
      // Les résultats MCP apparaissent dans SA conversation
      const results = await this.executeLayer(layer);

      // Checkpoint (état workflow sauvegardé)
      yield { type: "checkpoint", state: this.state };

      // AIL: Agent continue sa conversation
      const decision = await this.agent.continue(
        `Layer ${layer} completed. Continue or replan?`
      );

      // ✅ Agent voit tous les MCP results (comportement naturel Claude)
      // ✅ Pas de filtering contexte
      // ✅ Décisions informées avec contexte complet
    }
  }
}
```

**Principes Clés:**
- ✅ **Agent voit tous les MCP results:** Comportement normal de Claude (comme Bash, Read, etc.)
- ✅ **Conversation continue:** Pas de re-contexte, pas de pruning, pas de summary pour agent
- ✅ **MCP tools filtrent naturellement:** Les tools retournent résultats pertinents (top-k, search, etc.)
- ✅ **Décisions AIL informées:** Agent a accès à l'intégralité des résultats
- ✅ **Summary pour HIL uniquement:** Génération de résumés pour affichage UI humain (~500-1000 tokens)

**Coût Contexte:**
- **AIL:** Minimal (agent continue sa conversation avec MCP results déjà visibles)
- **HIL:** ~500-1000 tokens (génération summary pour affichage UI une fois)

**Note:** Les stratégies de "context pruning" ou "progressive summarization" seraient utiles uniquement pour des architectures multi-agents (supervisor ≠ executor), ce qui n'est pas le cas d'Epic 2.5.

---

### Performance Targets:

- Event stream overhead: <5ms per event
- Command queue latency: <10ms from enqueue to process
- State update: <1ms per reducer operation
- GraphRAG query (replan): <200ms
- Checkpoint save: <50ms (PGlite)
- Total feedback loop: <300ms end-to-end

### Implementation Plan:

**Epic 2.5:** Adaptive DAG Feedback Loops (9-13 hours)

**Story 2.5-1:** Event Stream + Command Queue + State Management (3-4h)
- ControlledExecutor foundation
- Event stream with TransformStream
- Command queue with AsyncQueue
- State reducers (MessagesState pattern)

**Story 2.5-2:** Checkpoint & Resume (2-3h)
- WorkflowState persistence to PGlite
- Resume from checkpoint
- State pruning strategy

**Story 2.5-3:** AIL/HIL Integration (2-3h)
- Agent decision points
- Human approval checkpoints
- Command injection patterns
- DAGSuggester.replanDAG() integration

**Story 2.5-4:** Speculative Execution + GraphRAG (3-4h)
- DAGSuggester.predictNextNodes()
- Confidence-based speculation
- GraphRAGEngine.updateFromExecution()
- Feedback loop validation

---

**Affects Epics:** Epic 2.5 (Stories 2.5-1 through 2.5-4)

**References:**
- ADR-007: `docs/adrs/ADR-007-dag-adaptive-feedback-loops.md`
- Research: `docs/research-technical-2025-11-13.md`
- Spike: `docs/spikes/spike-agent-human-dag-feedback-loop.md`

**Design Philosophy:** Feedback loops enable truly intelligent workflows that learn and adapt. The distinction between knowledge graph (permanent learning) and workflow graph (ephemeral execution) is critical for understanding the architecture.

---

## Pattern 5: Agent Code Execution & Local Processing (Epic 3)

**Status:** 🟡 IN PROGRESS (Stories 3.1-3.2 done, 3.4 ready for dev)

**Architecture Principle:** LLM writes code, sandbox executes safely

Epic 3 implémente un environnement d'exécution de code TypeScript sécurisé et isolé, permettant aux agents LLM d'**écrire du code de traitement** qui s'exécute localement pour filtrer/agréger les données volumineuses, retournant uniquement un résumé compact au contexte LLM.

### The Flow (Anthropic-Inspired Code Execution)

```
1. LLM voit tools disponibles → Vector search (Epic 1)
2. LLM décide quelle analyse faire → Natural language reasoning
3. LLM écrit code TypeScript → Agent generates custom processing code
4. Code s'exécute dans sandbox Deno → Isolated subprocess, timeout 30s, 512MB heap
5. Résultat traité retourne au LLM → Compact summary (<1KB), not raw data (1MB+)
```

**Concrete Example:**
```typescript
// User: "Analyze commits from last week"

// LLM discovers github.listCommits() via vector search
// LLM writes TypeScript code:
const code = `
  const commits = await github.listCommits({ limit: 1000 });

  // Filter locally (no context cost)
  const lastWeek = commits.filter(c =>
    new Date(c.date) > Date.now() - 7 * 24 * 3600 * 1000
  );

  // Aggregate locally
  const byAuthor = lastWeek.reduce((acc, c) => {
    acc[c.author] = (acc[c.author] || 0) + 1;
    return acc;
  }, {});

  // Return compact summary
  return Object.entries(byAuthor)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
`;

// Sandbox executes → 1000 commits (1.2MB) processed locally
// Returns to LLM: [{ author: "alice", count: 42 }, ...] (500 bytes)
// Context savings: 99.96%
```

### Architecture Components

**1. DenoSandboxExecutor** (`src/sandbox/executor.ts`) - Story 3.1 ✅
- Subprocess spawning: `Deno.Command` with explicit permissions
- Timeout enforcement: AbortController, 30s default
- Memory limits: `--v8-flags=--max-old-space-size=512`
- Structured errors: SyntaxError, RuntimeError, TimeoutError, MemoryError
- Performance: <100ms startup (achieved: 34.77ms), <50ms overhead

**2. ContextBuilder** (`src/sandbox/context-builder.ts`) - Story 3.2 ✅
- Intent-based tool discovery: Vector search for top-k relevant tools
- Type-safe wrapper generation: MCP tools → TypeScript functions
- Tool routing: Wrappers route calls through MCPGatewayServer
- Error propagation: MCP errors → JavaScript exceptions
- Security: No eval(), template strings only

**3. execute_code MCP Tool** (`src/mcp/gateway-server.ts`) - Story 3.4 ⏳
- MCP tool: `agentcards:execute_code`
- Input: `{ code: string, intent?: string, context?: object, sandbox_config?: object }`
- Output: `{ result: any, logs: string[], metrics: object, state?: object }`
- Modes: Intent-based (vector search) or Explicit (provided context)
- Integration: New TaskType `"code_execution"` in DAG

### Epic 2.5 Integration (Delegation Pattern)

**ControlledExecutor Delegation:**
```typescript
// Epic 2.5 ControlledExecutor builds DAG with code_execution tasks
const dag = {
  tasks: [
    { type: "mcp_tool", toolId: "github:list_commits" },  // Layer 0
    { type: "code_execution", code: "...", deps: [...] }, // Layer 1 (NEW)
    { type: "mcp_tool", toolId: "slack:send" }            // Layer 2
  ]
};

// ControlledExecutor routes code_execution tasks to sandbox
// Results integrated into WorkflowState via reducers
// Checkpoint-compatible (PGlite persistence)
```

**Safe-to-Fail Pattern:**
- Code execution tasks are **idempotent** (safe to retry)
- Sandbox isolation prevents side-effects
- Virtual filesystem hooks (foundation in 3.4, full implementation later)
- Rollback support: Execution can be aborted without permanent changes
- Foundation for Epic 3.5 speculation (safe speculative branches)

### What Epic 3 Does vs Doesn't Do

**✅ Epic 3 DOES:**
- Execute TypeScript code in isolated Deno sandbox
- Inject MCP tools into code context via vector search
- Process large datasets locally before returning to LLM
- Integrate as DAG task type in ControlledExecutor
- Provide safe-to-fail execution (sandbox isolation)
- Save code execution results in checkpoints

**❌ Epic 3 DOES NOT:**
- Automatically trigger DAG replanning from code
- Replan is AIL/HIL decision (Epic 2.5-3 already handles this)
- Code can return `state` for checkpoints, but no auto-enqueue of replan_dag
- Agent/Human decides when to replan based on code execution results

### Performance Targets

- Sandbox startup: <100ms (achieved: 34.77ms ✅)
- Code execution overhead: <50ms (achieved: 33.22ms ✅)
- Total execution (simple code): <500ms
- Tool discovery (intent-based): <200ms
- Hybrid workflow (5 tasks): <3s P95

### Security Model

- **Explicit permissions only:** `--allow-env`, `--allow-read=~/.agentcards`
- **Deny by default:** `--deny-write`, `--deny-net`, `--deny-run`, `--deny-ffi`
- **No eval():** Template strings only, no dynamic code generation
- **Process isolation:** Code runs in separate subprocess
- **Resource limits:** 30s timeout, 512MB heap

### Implementation Plan

**Epic 3:** Agent Code Execution & Local Processing (12-15 hours)

**Story 3.1:** Deno Sandbox Executor Foundation (2-3h) ✅ DONE
- DenoSandboxExecutor with subprocess isolation
- Timeout and memory limits
- Structured error handling

**Story 3.2:** MCP Tools Injection (2-3h) ✅ REVIEW
- ContextBuilder with vector search integration
- Type-safe tool wrappers
- Gateway routing for tool calls

**Story 3.3:** Local Data Processing Pipeline (2-3h) ⚠️ SCOPE CLARIFICATION
- **Status:** Likely skip/defer (overlaps with 3.4)
- Agent writes custom code instead of pre-built helpers

**Story 3.4:** execute_code MCP Tool (3-4h) ⏳ READY FOR DEV
- MCP tool registration in gateway
- Intent-based and explicit modes
- DAG integration (new TaskType)
- Checkpoint compatibility
- Safe-to-fail foundation

**Stories 3.5-3.8:** Advanced Features (4-6h) 📋 DRAFTED/BACKLOG
- 3.5: PII detection/tokenization
- 3.6: Code execution caching
- 3.7: E2E tests & documentation
- 3.8: Security hardening

---

**Affects Epics:** Epic 3 (Stories 3.1-3.8)

**References:**
- Tech Spec: `docs/tech-spec-epic-3.md`
- ADR-007: `docs/adrs/ADR-007-dag-adaptive-feedback-loops.md` (Epic 3 delegation architecture)
- Story 3.1: `docs/stories/story-3.1.md`
- Story 3.2: `docs/stories/story-3.2.md`
- Story 3.4: `docs/stories/story-3.4.md`

**Design Philosophy:** Code execution enables agents to "think locally, act globally" - process massive datasets locally, return compact insights. Sandbox isolation provides safe-to-fail semantics essential for speculative execution (Epic 3.5).

---

## Implementation Patterns

### Naming Conventions

**Files & Directories:**
- Files: `kebab-case.ts` (e.g., `vector-search.ts`)
- Directories: `kebab-case/` (e.g., `mcp/`, `dag/`)
- Test files: `*.test.ts` (co-located with source)
- Benchmark files: `*.bench.ts`

**Code Identifiers:**
- Classes: `PascalCase` (e.g., `VectorSearchEngine`)
- Interfaces/Types: `PascalCase` with `I` prefix for interfaces (e.g., `IConfig`, `ToolSchema`)
- Functions: `camelCase` (e.g., `buildDependencyGraph`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `MAX_RETRIES`)
- Private fields: `_camelCase` with underscore prefix

**Database:**
- Tables: `snake_case` singular (e.g., `tool_schema`, `embedding`)
- Columns: `snake_case` (e.g., `tool_id`, `created_at`)
- Indexes: `idx_{table}_{column}` (e.g., `idx_embedding_vector`)

### Code Organization

**Dependency Pattern:**
```typescript
// deps.ts - ALL external dependencies centralized
export { PGlite } from "npm:@electric-sql/pglite@0.3.11";
export { vector } from "npm:@electric-sql/pglite@0.3.11/vector";
export { Command } from "https://deno.land/x/cliffy@v1.0.0-rc.4/command/mod.ts";
export * as log from "https://deno.land/std@0.224.0/log/mod.ts";
// ... all deps here

// Usage in modules
import { PGlite, vector } from "../../deps.ts";
```

**Module Exports:**
```typescript
// mod.ts - Public API (re-exports)
export { VectorSearch } from "./src/vector/search.ts";
export { MCPGateway } from "./src/mcp/gateway.ts";
export type { Config, ToolSchema } from "./src/types.ts";
```

**Test Organization:**
- Unit tests: Co-located with source (`src/vector/search.test.ts`)
- Integration: `tests/integration/vector-db.test.ts`
- E2E: `tests/e2e/migration-workflow.test.ts`

### Error Handling

**Custom Error Hierarchy:**
```typescript
// src/utils/errors.ts
export class AgentCardsError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "AgentCardsError";
  }
}

export class MCPServerError extends AgentCardsError {
  constructor(message: string, public serverId: string) {
    super(message, "MCP_SERVER_ERROR");
  }
}

export class VectorSearchError extends AgentCardsError {
  constructor(message: string) {
    super(message, "VECTOR_SEARCH_ERROR");
  }
}

export class DAGExecutionError extends AgentCardsError {
  constructor(message: string, public toolId?: string) {
    super(message, "DAG_EXECUTION_ERROR");
  }
}
```

**Error Handling Pattern:**
```typescript
// All async operations wrapped in try-catch
async function executeWorkflow(tools: Tool[]): Promise<Result> {
  try {
    const dag = buildDAG(tools);
    const results = await executeDag(dag);
    return { success: true, data: results };
  } catch (error) {
    if (error instanceof DAGExecutionError) {
      logger.error(`DAG execution failed: ${error.message}`, { toolId: error.toolId });
      return { success: false, error: error.message, code: error.code };
    }
    throw error; // Re-throw unknown errors
  }
}

// Timeouts enforced (Story 2.6 AC)
const DEFAULT_TIMEOUT = 30_000; // 30s per tool
```

### Logging Strategy

**Log Levels:**
```typescript
// src/telemetry/logger.ts
import * as log from "std/log";

export const logger = log.getLogger();

// Usage:
logger.error("Critical failure", { context: {...} });
logger.warn("Degraded performance detected");
logger.info("Workflow completed", { duration: 4200 });
logger.debug("Vector search query", { query, results });
```

**Structured Format:**
```json
{
  "timestamp": "2025-11-03T10:30:45.123Z",
  "level": "INFO",
  "message": "Workflow completed",
  "context": {
    "duration_ms": 4200,
    "tools_executed": 5,
    "parallel_branches": 2
  }
}
```

**Log Destinations:**
- Console: INFO level (colorized for terminal)
- File: `~/.agentcards/logs/agentcards.log` (all levels, rotated daily)

---

## Consistency Rules

### Cross-Cutting Patterns

**Date/Time Handling:**
- All timestamps: ISO 8601 format (`2025-11-03T10:30:45.123Z`)
- Library: Native `Date` object, no moment.js
- Storage: PostgreSQL `TIMESTAMPTZ` type

**Async Patterns:**
- All I/O operations: `async/await` (no callbacks)
- Parallel operations: `Promise.all()` for independent tasks
- Sequential: `for...of` with `await` for dependent tasks

**Configuration Access:**
```typescript
// Single source of truth
const config = await loadConfig("~/.agentcards/config.yaml");
// Pass explicitly, no global state
```

**Retries:**
```typescript
// src/utils/retry.ts
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000
): Promise<T> {
  // Exponential backoff: 1s, 2s, 4s
}
```

---

## Data Architecture

### Database Schema (PGlite)

```sql
-- Story 1.2: Initial schema

CREATE TABLE tool_schema (
  tool_id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  input_schema JSONB NOT NULL,
  output_schema JSONB,
  cached_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tool_embedding (
  tool_id TEXT PRIMARY KEY REFERENCES tool_schema(tool_id) ON DELETE CASCADE,
  embedding vector(1024) NOT NULL,  -- BGE-Large-EN-v1.5 dimensions
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW index for vector similarity search
CREATE INDEX idx_embedding_vector ON tool_embedding
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE TABLE config_metadata (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE telemetry_metrics (
  id SERIAL PRIMARY KEY,
  metric_name TEXT NOT NULL,
  value NUMERIC NOT NULL,
  tags JSONB,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_metrics_timestamp ON telemetry_metrics(timestamp DESC);
CREATE INDEX idx_metrics_name ON telemetry_metrics(metric_name);
```

### Data Models

```typescript
// src/types.ts

export interface ToolSchema {
  toolId: string;
  serverId: string;
  name: string;
  description: string;
  inputSchema: JSONSchema;
  outputSchema?: JSONSchema;
  cachedAt: Date;
}

export interface ToolEmbedding {
  toolId: string;
  embedding: Float32Array;  // 1024-dim vector
  createdAt: Date;
}

export interface SearchResult {
  toolId: string;
  score: number;  // Cosine similarity [0-1]
  schema: ToolSchema;
}
```

---

## API Contracts

### CLI Commands

```bash
# Story 1.7: Migration tool
agentcards init [--dry-run] [--config <path>]
# Output: Migration summary, instructions

# Story 2.4: Gateway server
agentcards serve [--port <port>] [--stdio]
# Runs MCP gateway server

# Story 2.5: Health checks
agentcards status [--verbose]
# Output: Server health, database size, metrics
```

### Internal APIs

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

## Security Architecture

**Sandboxing:**
- Deno permissions model: Explicit `--allow-read`, `--allow-net`, etc.
- MCP servers run as separate processes (isolated)
- No eval/Function constructor usage

**Data Protection:**
- User queries: Never leave local machine
- Telemetry: Opt-in, anonymized (no PII)
- Database: Local filesystem (`~/.agentcards/agentcards.db`)

**Input Validation:**
- All CLI args validated via cliffy schemas
- MCP responses validated against JSON Schema
- SQL injection: Prevented via parameterized queries (PGlite)

---

## Performance Considerations

### Targets (from NFR001)

- **P95 Latency:** <3 seconds for 5-tool workflow
- **Vector Search:** <100ms P95 (Story 1.5 AC)
- **Context Usage:** <5% of LLM window (Story 1.6 AC)

### Optimization Strategies

**1. Vector Search:**
- HNSW index parameters: `m=16`, `ef_construction=64` (balanced quality/speed)
- Query batch size: 5-10 tools (trade-off recall/latency)

**2. Embeddings Generation:**
- Batch processing: Generate embeddings in parallel (Story 1.4)
- Caching: Never regenerate if schema unchanged
- Model loading: Lazy load BGE model on first query

**3. DAG Execution:**
- Parallel branches: `Promise.all()` for independent tools
- Streaming: SSE events (Story 2.3) for progressive feedback
- Timeouts: 30s per tool, fail fast

**4. Database:**
- PGlite: In-memory mode for CI/tests
- Filesystem persistence: `~/.agentcards/` for production
- Index maintenance: Auto-vacuum disabled (read-heavy)

---

## Deployment Architecture

**Target:** Local-first CLI tool (no server deployment MVP)

**Supported Platforms:**
- macOS (x64, ARM64)
- Linux (x64, ARM64)
- Windows (x64) - via WSL or native Deno

**Distribution:**
```bash
# Installation (future)
deno install -A -n agentcards jsr:@agentcards/cli

# Or via Homebrew (future)
brew install agentcards
```

**Runtime Requirements:**
- Deno 2.2+ (LTS)
- 4GB RAM minimum (BGE model + HNSW index)
- 1GB disk space (database + logs + models)

**Edge Deployment (out of scope MVP):**
- Deno Deploy compatible (architecture edge-ready)
- Future: v1.1+ if demand

---

## Development Environment

### Prerequisites

- Deno 2.2+ ([deno.com](https://deno.com))
- Git 2.30+
- VS Code (recommended) with Deno extension

### Setup Commands

```bash
# Clone repository
git clone https://github.com/username/agentcards.git
cd agentcards

# Initialize Deno project (Story 1.1)
deno task init

# Install dependencies (auto via deno.json imports)

# Run tests
deno task test

# Run benchmarks
deno task bench

# Format code
deno task fmt

# Lint code
deno task lint

# Build (compile to binary)
deno task build

# Run locally
deno task dev -- serve
```

### deno.json Tasks

```json
{
  "tasks": {
    "dev": "deno run -A main.ts",
    "test": "deno test -A",
    "bench": "deno bench -A",
    "fmt": "deno fmt",
    "lint": "deno lint",
    "build": "deno compile -A -o dist/agentcards main.ts"
  }
}
```

---

## Architecture Decision Records (ADRs)

### ADR-001: PGlite over SQLite for Vector Search

**Decision:** Use PGlite (PostgreSQL WASM) with pgvector instead of SQLite + sqlite-vec

**Rationale:**
- sqlite-vec v0.1.0 lacks HNSW index (full-scan only)
- pgvector provides production-ready HNSW + IVFFlat
- PGlite is embedded (3MB WASM), preserves portability requirement
- Deno compatibility verified (npm:@electric-sql/pglite)
- Trade-off: 3MB overhead vs <1MB SQLite, acceptable for performance gain

**Consequences:**
- Enables <100ms P95 vector search (NFR001)
- Single-file portability maintained
- PostgreSQL ecosystem access (future extensions)

**Alternatives Considered:**
- sqlite-vec: Rejected (no HNSW, future-only)
- DuckDB VSS: Rejected (experimental persistence, Deno support unclear)
- Full PostgreSQL: Rejected (breaks zero-config requirement)

---

### ADR-002: Custom DAG Implementation (Zero External Dependencies)

**Decision:** Implement DAG builder and executor from scratch, no external graph libraries

**Rationale:**
- Story 2.1 AC explicitly requires "custom, zero external dependency"
- Topological sort is ~50 LOC (simple algorithm)
- Avoids dependency bloat for single-purpose feature
- Educational value for agents implementing this

**Consequences:**
- Full control over algorithm
- No security vulnerabilities from external deps
- More testing required (edge cases, cycles)

---

### ADR-003: BGE-Large-EN-v1.5 for Local Embeddings

**Decision:** Use BGE-Large-EN-v1.5 via @huggingface/transformers (local inference)

**Rationale:**
- 1024-dim embeddings (good quality/size trade-off)
- Local inference = no API calls, no API keys, privacy preserved
- Deno compatible via npm: prefix
- SOTA open model for semantic search

**Consequences:**
- 4GB RAM requirement (model in memory)
- ~60s initial embedding generation for 200 tools (acceptable per Story 1.4 AC)
- No usage costs (vs OpenAI embeddings API)

---

### ADR-004: stdio Transport Primary, SSE Optional

**Decision:** MCP gateway uses stdio transport as primary, SSE as optional enhancement

**Rationale:**
- MCP servers commonly use stdio (Claude Code default)
- SSE adds complexity (HTTP server required)
- Story 2.4 AC: "stdio mode primary"
- Local CLI tool doesn't need HTTP transport MVP

**Consequences:**
- Simpler architecture (no HTTP server MVP)
- SSE available for future remote deployment
- Gateway compatible with all stdio MCP servers

---

### ADR-005: Graphology for GraphRAG (True Graph Algorithms)

**Decision:** Use Graphology library for graph algorithms instead of pseudo-GraphRAG with recursive CTEs in PostgreSQL

**Context:** User insight: "et networkx ou un truc comme ca?" (what about networkx or something like that?)

**Rationale:**
- Graphology is the "NetworkX of JavaScript" (~100KB)
- True graph algorithms: Real PageRank, Louvain community detection, bidirectional search
- 90% simpler SQL schema (just storage, no recursive CTEs)
- 3-5x performance improvement vs pseudo-SQL approach
- Hybrid architecture: PGlite stores data, Graphology computes metrics
- Better separation of concerns: Storage vs computation

**Consequences:**
- Enables true GraphRAG capabilities for workflow suggestion
- Simplifies database schema dramatically
- Fast graph operations (<100ms PageRank, <1ms shortest path)
- Foundation for speculative execution (THE feature)
- Small dependency footprint (~100KB vs implementing algorithms in SQL)

**Alternatives Considered:**
- Recursive CTEs + pseudo-PageRank: Rejected (90% more complex SQL, 3-5x slower)
- NetworkX (Python): Rejected (language barrier, would need Python runtime)
- Full graph database (Neo4j): Rejected (breaks portability requirement)

**User Confirmation:** "Ouai cest mieux je pense non?" (Yes it's better right?)

---

### ADR-006: Speculative Execution as Default Mode

**Decision:** Make speculative execution the default mode for high-confidence workflows (>0.85), not an optional feature

**Context:** User insight: "et donc les algo graph aident la gateway a performer l action avant meme l appel de claude non ? cetait l idee" (so the graph algorithms help the gateway perform the action even before Claude's call, right? That was the idea)

**Rationale:**
- **THE feature** - core differentiator of AgentCards
- 0ms perceived latency (results ready when user confirms)
- Even with Claude confirmation dialogs, provides instant results vs 2-5s wait
- Context savings ($5-10/day) >> waste from occasional misspeculation ($0.50)
- GraphRAG provides confidence scores for safe speculation
- Multiple safety guardrails prevent dangerous operations

**Consequences:**
- Dramatic improvement in perceived performance
- Requires adaptive threshold learning (start conservative at 0.92)
- Need comprehensive safety checks for dangerous operations
- Metrics tracking for success/acceptance/waste rates
- Graceful fallback to suggestion mode on failure

**Safety Measures:**
- Never speculate on: delete, deploy, payment, send_email operations
- Cost limits: <$0.10 per speculative execution
- Resource limits: <5s execution time
- Confidence threshold: >0.85 minimum (adaptive learning from user feedback)

**User Confirmation:** "Ouai on peut essayer sans speculative mais on va pas se mentir, speculative c est THE feature" (Yeah we can try without speculative but let's be honest, speculative IS THE feature)

**Design Philosophy:** Optimistic execution with smart safeguards > Conservative suggestion-only mode

---

### ADR-007: DAG Adaptatif avec Feedback Loops AIL/HIL et Re-planification Dynamique

**Decision:** Étendre ParallelExecutor avec architecture hybride: Event Stream + Command Queue + MessagesState-inspired Reducers

**Context:** Le DAG executor actuel s'exécute de manière linéaire sans feedback loops, sans points de décision agent/humain, sans multi-turn, et sans capacité de re-planification.

**Rationale:**
- Architecture hybride combine best practices de LangGraph MessagesState (reducers automatiques) + Event Stream (observability)
- Score 95/100 après analyse comparative de 8 options (vs 80/100 pour State Machine, 68/100 pour Sync Checkpoints)
- 15% code reduction grâce aux reducers automatiques (add_messages, add_tasks, add_decisions)
- Zero breaking changes - extension compatible de ParallelExecutor
- Time to market: 9-13h vs 20-30h pour alternatives (State Machine full refactoring)
- Performance préservée: Speedup 5x maintenu, speculation 23-30% gain

**Architecture:**
```typescript
// State avec reducers MessagesState-inspired
interface WorkflowState {
  messages: Message[];       // Reducer: append
  tasks: TaskResult[];       // Reducer: append
  decisions: Decision[];     // Reducer: append
  context: Record<string, any>; // Reducer: merge
}

// Event Stream + Command Queue + State Management
class ControlledExecutor extends ParallelExecutor {
  private state: WorkflowState;
  private commandQueue: AsyncQueue<Command>;
  private eventStream: TransformStream<ExecutionEvent>;

  async *executeStream(dag: DAGStructure, config: ExecutionConfig) {
    // Non-blocking, observable, avec state management robuste
  }
}
```

**Consequences:**
- ✅ 100% requirements: AIL, HIL, multi-turn, dynamic DAG, GraphRAG re-trigger
- ✅ Modern patterns: LangGraph v1.0 MessagesState best practices (2025)
- ✅ Observability: Event stream pour monitoring temps réel
- ✅ Production-ready: Patterns éprouvés (LangGraph + Prefect + Event-Driven.io)
- ✅ Un seul agent: Conversation continue, pas de filtering contexte
- ⚠️ Complexité moyenne: Event-driven + reducers (patterns standards)

**Checkpoint Architecture:**
- Sauvegarde: WorkflowState complet (tasks, decisions, messages, context)
- Ne sauvegarde PAS: Filesystem state, external side-effects
- Epic 2.5 = orchestration primarily → Checkpoints suffisants
- Epic 3 (Sandbox) gérera isolation complète des modifications de code

**Context Management:**
- Un seul agent Claude en conversation continue
- Agent voit tous les MCP results (comportement normal de Claude)
- Pas de pruning/summary pour agent (décisions informées)
- Summary seulement pour HIL (affichage UI humain)
- Coût AIL: Minimal (conversation continue)
- Coût HIL: ~500-1000 tokens (generation summary UI)

**Implementation:** 4 sprints progressifs (9-13h total)
1. Sprint 1: State Management & Checkpoints avec reducers (2-3h)
2. Sprint 2: Command Queue & Agent Control (2-3h)
3. Sprint 3: Event-Driven + Human Loop (2-3h)
4. Sprint 4: Speculative Execution (3-4h)

**3-Loop Learning Architecture:**
- **Loop 1 (Execution):** Event stream, state management, checkpoints (milliseconds)
- **Loop 2 (Adaptation):** AIL/HIL, dynamic replanning, GraphRAG re-queries (seconds-minutes)
- **Loop 3 (Meta-Learning):** Knowledge graph updates, pattern learning (per-workflow)

**References:**
- Technical Research: `docs/research-technical-2025-11-13.md`
- Spike: `docs/spikes/spike-agent-human-dag-feedback-loop.md`
- ADR Detail: `docs/adrs/ADR-007-dag-adaptive-feedback-loops.md`
- ADR-008: `docs/adrs/ADR-008-episodic-memory-adaptive-thresholds.md` (Extension Loop 3)

**User Insight:** "maintenant dans langgraph ya le message state je crois qui est plus flexible" - Analysis révèle que MessagesState + Event Stream sont complémentaires, pas opposés.

**Status:** ✅ Approved v2.0 (2025-11-14) - Ready for implementation

---

_Generated by BMAD Decision Architecture Workflow v1.3.2_
_Date: 2025-11-03_
_Updated: 2025-11-14 (ADR-007 Approved - Pattern 4: 3-Loop Learning Architecture with Checkpoint & Context Management clarifications)_
_Updated: 2025-11-24 (ADR-019 - Two-Level AIL Architecture, MCP compatibility corrections)_
_For: BMad_
