# Novel Pattern Designs

## Pattern 1: DAG Builder with JSON Schema Dependency Detection

> **ADRs:** ADR-002 (Custom DAG), ADR-022 (Hybrid Search Integration)

**Problem:** Automatically detect dependencies between MCP tools to enable parallel execution
without manual dependency specification.

**Challenge:** MCP tools expose input/output schemas as JSON Schema. Need to infer which outputs
feed into which inputs semantically.

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
  from: string; // Source tool ID
  to: string; // Target tool ID
  dataPath: string; // e.g., "output.content → input.jsonString"
}

// Story 2.1 AC: Custom topological sort (no external deps)
function buildDAG(tools: Tool[]): { nodes: DAGNode[]; edges: DAGEdge[] } {
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

### Hybrid Search Integration (ADR-022)

The DAGSuggester uses Hybrid Search (Semantic + Graph) to find relevant tools:

```typescript
async searchToolsHybrid(
  query: string,
  limit: number = 10,
  contextTools: string[] = []
): Promise<HybridSearchResult[]> {
  // 1. Semantic Search (Base) - finds textually relevant tools
  const semanticResults = await this.vectorSearch.searchTools(query, limit * 2);

  // 2. Adaptive Alpha Calculation (graph density)
  const alpha = this.calculateAdaptiveAlpha();

  // 3. Graph Scoring (Adamic-Adar + Neighbors)
  return semanticResults.map(tool => {
    const graphScore = this.computeGraphRelatedness(tool.id, contextTools);
    // Hub tools (high PageRank) get boosted
    const finalScore = (alpha * tool.score) + ((1 - alpha) * graphScore);
    return { ...tool, score: finalScore };
  });
}
```

**Benefits:**
- Finds implicit dependencies (e.g., `npm_install` between `git_clone` and `deploy`)
- Graph intelligence bubbles related tools into candidates
- Reduces "fragile DAGs" for complex intents

**Affects Epics:** Epic 2 (Story 2.1, 2.2), Epic 5 (Story 5.1)

---

## Pattern 2: Context Budget Management

> **ADRs:** ADR-013 (Semantic Filtering)

**Problem:** Maintain <5% context consumption while supporting 15+ MCP servers dynamically.

**Solution Architecture:**

### Meta-Tools Only Exposure (ADR-013)

Instead of exposing all MCP tools (~44.5k tokens), the gateway returns only meta-tools:

```typescript
// Before ADR-013: 100+ tools exposed (44.5k tokens)
// After ADR-013: 2 meta-tools exposed (~500 tokens)

const META_TOOLS = [
  "pml:execute_workflow",  // Intent-based workflow execution
  "pml:execute_code",      // Sandbox code execution
];

// Tool discovery via intent, not enumeration
{ "tool": "pml:execute_workflow", "params": { "intent": "search the web for AI news" } }
// DAGSuggester uses vector search internally to find relevant tools
```

**Impact:**
- Context reduced from 44.5k to ~500 tokens (99% reduction)
- Forces intent-driven tool usage (better UX)
- Tool schemas loaded dynamically only when needed

### Context Budget Tracker:

```typescript
interface ContextBudget {
  totalTokens: number; // LLM context window (e.g., 200k)
  budgetTokens: number; // Allocated for tool schemas (5% = 10k)
  usedTokens: number; // Currently loaded schemas
  availableTokens: number; // Remaining budget
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

## Pattern 3: Speculative Execution with GraphRAG (THE Feature)

**Problem:** Reduce latency by executing workflows optimistically before Claude responds, when
confidence is high enough.

**Vision:** The gateway should perform actions BEFORE Claude's call, not just suggest them. Have
results ready immediately when user confirms.

**Solution Architecture:**

**Components:**

1. **GraphRAG Engine** (`dag/builder.ts`)
   - Uses Graphology for true graph algorithms (not pseudo-SQL)
   - PageRank for tool importance ranking
   - Louvain community detection for related tools
   - Bidirectional shortest path for dependency chains
   - Hybrid: PGlite stores edges, Graphology computes metrics

2. **Three Execution Modes**
   - `explicit_required` (confidence < 0.70): No pattern found, Claude must provide explicit
     workflow
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
  naturalLanguageQuery: "Read all JSON files and create a summary report",
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
    results: results, // Already executed!
    confidence: 0.92,
    note: "✨ Results prepared speculatively - ready immediately",
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
    "filesystem:read → json:parse → github:create (2 hops)",
  ],
  pageRankScores: {
    "filesystem:read": 0.15,
    "json:parse": 0.12,
  },
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

**Design Philosophy:** Speculative execution is THE feature - the core differentiator. Not optional,
not opt-in. Default mode with smart safeguards.

---

## Pattern 4: 3-Loop Learning Architecture (Adaptive DAG Feedback Loops)

> **⚠️ UPDATE 2025-11-24:** AIL/HIL implementation details updated. See **ADR-019: Two-Level AIL
> Architecture** for MCP-compatible approach using HTTP response pattern (not SSE streaming). Story
> 2.5-3 SSE pattern incompatible with MCP one-shot protocol.

**Problem:** Enable truly adaptive workflows that learn and improve over time through
agent-in-the-loop (AIL) and human-in-the-loop (HIL) decision points, with dynamic re-planning and
continuous meta-learning.

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

- **Nodes:** Specific tasks to execute for THIS workflow (e.g., "read config.json", "parse it",
  "validate")
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

## Components:

**1. ControlledExecutor** (`src/dag/controlled-executor.ts`)

- Extends `ParallelExecutor` (zero breaking changes)
- Event stream for real-time observability
- Command queue for non-blocking control
- State management with MessagesState-inspired reducers

**2. WorkflowState with Reducers**

```typescript
interface WorkflowState {
  messages: Message[]; // Agent/human messages (reducer: append)
  tasks: TaskResult[]; // Completed tasks (reducer: append)
  decisions: Decision[]; // AIL/HIL decisions (reducer: append)
  context: Record<string, any>; // Shared context (reducer: merge)
  checkpoint_id?: string; // Resume capability
}

// MessagesState-inspired reducers (LangGraph v1.0 pattern)
const reducers = {
  messages: (existing, update) => [...existing, ...update],
  tasks: (existing, update) => [...existing, ...update],
  decisions: (existing, update) => [...existing, ...update],
  context: (existing, update) => ({ ...existing, ...update }),
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
    private graphEngine: GraphRAGEngine, // Uses knowledge graph
    private vectorSearch: VectorSearch,
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
    },
  ): Promise<DAGStructure> {
    // 1. graphEngine.vectorSearch(newRequirement) → New tools
    // 2. graphEngine.findShortestPath(current, target) → Optimize path
    // 3. graphEngine.buildDAG([...existing, ...new]) → Augmented DAG
  }

  // ✅ NEW METHOD - Speculative prediction
  async predictNextNodes(
    state: WorkflowState,
    completed: TaskResult[],
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
  async vectorSearch(query: string, k: number): Promise<Tool[]>;
  getPageRank(toolId: string): number;
  buildDAG(toolIds: string[]): DAGStructure;

  // ✅ EXISTS - Used by replanDAG()
  findShortestPath(from: string, to: string): string[];
  findCommunityMembers(toolId: string): string[];

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

## Complete Feedback Loop (3 Phases):

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

## 4 Roles of GraphRAG in Feedback Loop:

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

## Integration with ControlledExecutor:

```typescript
class ControlledExecutor extends ParallelExecutor {
  private dagSuggester: DAGSuggester; // Workflow layer
  private graphEngine: GraphRAGEngine; // Knowledge layer
  private state: WorkflowState;
  private commandQueue: AsyncQueue<Command>;
  private eventStream: TransformStream<ExecutionEvent>;

  async executeWithControl(dag: DAGStructure, config: ExecutionConfig) {
    // Before each layer: Speculative prediction
    if (config.speculation.enabled) {
      const predictions = await this.dagSuggester.predictNextNodes(
        this.state,
        this.state.tasks,
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
      success: true,
    });
  }

  private async handleReplanCommand(cmd: ReplanCommand) {
    // DAGSuggester re-queries GraphRAG for new tools
    const updatedDAG = await this.dagSuggester.replanDAG(
      this.currentDAG,
      {
        completedTasks: this.state.tasks,
        newRequirement: cmd.requirement,
        availableContext: this.state.context,
      },
    );

    // Merge new nodes into current DAG
    this.mergeDynamicNodes(updatedDAG.newNodes);
  }
}
```

---

## Benefits:

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

## Checkpoint Architecture & Workflow State

**What Checkpoints Save:**

Checkpoints sauvegardent l'état complet du workflow dans PGlite :

```typescript
interface Checkpoint {
  id: string;
  workflow_id: string;
  timestamp: Date;
  layer: number; // Current DAG layer
  state: WorkflowState; // Complete workflow state
}

interface WorkflowState {
  workflow_id: string;
  current_layer: number;
  tasks: TaskResult[]; // Completed tasks with results
  decisions: Decision[]; // AIL/HIL decisions made
  commands: Command[]; // Pending commands
  messages: Message[]; // Multi-turn conversation
  context: Record<string, any>; // Workflow context
}
```

**What Checkpoints DON'T Save:**

- ❌ Filesystem state (modified files)
- ❌ External side-effects (API calls, DB writes)
- ❌ Code diffs or file changes

**Why This Works for Epic 2.5:**

- Epic 2.5 workflows = **orchestration primarily** (AIL/HIL decisions, GraphRAG queries, DAG
  replanning)
- File modifications **delegated to Epic 3** (Sandbox isolation)
- Tasks requiring file changes → **idempotence required** (documented per story)

**Resume Behavior:**

- ✅ **Read-only workflows:** Perfect resume (zero data loss)
- ⚠️ **Workflows with modifications:** Tasks re-execute (idempotency ensures safety)
- 🎯 **Epic 3 (future):** Sandbox isolation eliminates this concern entirely

---

## Context Management & Agent Architecture

**Architecture Principle:** Un seul agent en conversation continue

Epic 2.5 utilise un seul agent Claude qui exécute le DAG via ses MCP tools et prend toutes les
décisions (AIL) dans sa conversation continue.

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
- ✅ **MCP tools filtrent naturellement:** Les tools retournent résultats pertinents (top-k, search,
  etc.)
- ✅ **Décisions AIL informées:** Agent a accès à l'intégralité des résultats
- ✅ **Summary pour HIL uniquement:** Génération de résumés pour affichage UI humain (~500-1000
  tokens)

**Coût Contexte:**

- **AIL:** Minimal (agent continue sa conversation avec MCP results déjà visibles)
- **HIL:** ~500-1000 tokens (génération summary pour affichage UI une fois)

**Note:** Les stratégies de "context pruning" ou "progressive summarization" seraient utiles
uniquement pour des architectures multi-agents (supervisor ≠ executor), ce qui n'est pas le cas
d'Epic 2.5.

---

## Performance Targets:

- Event stream overhead: <5ms per event
- Command queue latency: <10ms from enqueue to process
- State update: <1ms per reducer operation
- GraphRAG query (replan): <200ms
- Checkpoint save: <50ms (PGlite)
- Total feedback loop: <300ms end-to-end

## Implementation Plan:

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

**Design Philosophy:** Feedback loops enable truly intelligent workflows that learn and adapt. The
distinction between knowledge graph (permanent learning) and workflow graph (ephemeral execution) is
critical for understanding the architecture.

---

## Pattern 5: Scoring Algorithms & Adaptive Alpha

> **ADRs:** ADR-015 (Dynamic Alpha), ADR-023 (Candidate Expansion), ADR-024 (Adjacency Matrix),
> ADR-026 (Cold Start), ADR-038 (Scoring Reference), ADR-048 (Local Adaptive Alpha)

**Problem:** Le scoring des outils et capabilities nécessite différents algorithmes selon le mode
(recherche active vs suggestion passive) et le type d'objet (Tool vs Capability).

**Solution Architecture:**

### Algorithms Matrix

| Object Type     | Active Search (User Intent)                      | Passive Suggestion (Workflow Context)              |
| :-------------- | :----------------------------------------------- | :------------------------------------------------- |
| **Simple Tool** | Hybrid Search: `Semantic * α + Graph * (1-α)`    | Next Step: `Co-occurrence + Louvain + Recency`     |
| **Capability**  | Capability Match: `Semantic * SuccessRate`       | Strategic Discovery: `ToolsOverlap * ClusterBoost` |

### Alpha Matrix (ADR-048)

| Mode                | Type       | Algorithm              | Rationale                           |
| :------------------ | :--------- | :--------------------- | :---------------------------------- |
| Active Search       | Tool/Cap   | Embeddings Hybrides    | Compare semantic vs structure       |
| Passive Suggestion  | Tool       | Heat Diffusion         | Propagation depuis le contexte      |
| Passive Suggestion  | Capability | Heat Diffusion Hiérarch| Respecte Tool→Cap→Meta hierarchy    |
| Cold Start (<5 obs) | All        | Bayesian Prior         | alpha=1.0 (semantic only)           |

### Key Formulas

**1. Hybrid Search (Tools):**
```typescript
const finalScore = alpha * semanticScore + (1 - alpha) * graphScore;

// Alpha local (ADR-048) remplace alpha global (ADR-015)
// - Dense cluster: alpha ≈ 0.5 (graph useful)
// - Isolated node: alpha ≈ 1.0 (semantic only)
```

**2. Next Step Prediction:**
```typescript
const toolScore =
  cooccurrenceConfidence * 0.6 +  // Historique direct (A -> B)
  communityBoost * 0.3 +           // Louvain (même cluster)
  recencyBoost * 0.1 +             // Utilisé récemment
  pageRank * 0.1;                  // Importance globale
```

**3. Cold Start (ADR-026):**
```typescript
// Bayesian approach quand observations < seuil
const confidence = observations >= MIN_OBS
  ? empiricalConfidence
  : bayesianPrior(observations, alpha=1.0);
```

**4. Candidate Expansion (ADR-023):**
```typescript
// Expansion 1.5-3x selon la densité
const expandedK = Math.min(k * expansionFactor, maxCandidates);
const expansionFactor = 1.5 + (1 - density) * 1.5; // 1.5x dense → 3x sparse
```

### Hierarchical Heat Diffusion (ADR-048)

Pour les suggestions passives de capabilities, la chaleur se propage en respectant la hiérarchie :

```
MetaCapabilities (émergentes, ∞)
       │ contains
       ▼
Capabilities (dependency, sequence, alternative)
       │ contains
       ▼
Tools (co-occurrence, edges directs)
```

**Heat Diffusion Formula:**
```typescript
// Propagation depuis le contexte actuel
heat[node] = Σ (neighbor_heat × edge_weight × decay_factor)

// Decay selon la distance hiérarchique
decay_factor = {
  same_level: 0.9,      // Tool → Tool
  up_hierarchy: 0.7,    // Tool → Capability
  down_hierarchy: 0.5,  // Capability → Tool
}
```

### Graph Structure (ADR-024)

**Full Adjacency Matrix N×N:**
- Stocke toutes les paires de tools observées
- Cycle breaking automatique (DAG constraint)
- Edge weights par type et source

**Edge Types & Weights:**
```typescript
const EDGE_TYPE_WEIGHTS = {
  dependency: 1.0,   // A dépend de B
  contains: 0.8,     // Capability contient Tool
  sequence: 0.5,     // A suivi de B (observé)
  alternative: 0.3,  // A ou B (interchangeable)
};

const EDGE_SOURCE_WEIGHTS = {
  observed: 1.0,     // Vu en production
  inferred: 0.7,     // Déduit par algo
  template: 0.5,     // Bootstrap initial
};
```

**Affects Epics:** Epic 5 (Tools Scoring), Epic 7 (Capabilities Matching)

**References:**
- ADR-038: `docs/adrs/ADR-038-scoring-algorithms-reference.md`
- ADR-048: `docs/adrs/ADR-048-hierarchical-heat-diffusion-alpha.md`
- ADR-015: `docs/adrs/ADR-015-dynamic-alpha-graph-density.md`

---
