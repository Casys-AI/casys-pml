# Rethinking MCP Server Architecture: Gateways, Parallel Execution, and Code Sandboxing

**Author:** AgentCards Team
**Date:** January 2025
**Topics:** MCP Protocol, Agent Architecture, Performance Optimization

---

## The MCP Scalability Challenge

The Model Context Protocol (MCP) promised to become the "USB standard" for AI agents—a universal interface for connecting language models to tools and data sources. And in many ways, it has delivered. Hundreds of MCP servers now exist, from filesystem access to GitHub integration to database queries. Developers can theoretically compose these servers into powerful agent workflows.

But there's an irony at the heart of MCP adoption: **the protocol scales, but the user experience doesn't.**

The community has largely converged on a straightforward architecture: Claude Desktop (or Claude Code) connects directly to multiple MCP servers simultaneously. Your configuration might look like this:

```json
{
  "mcpServers": {
    "filesystem": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem"] },
    "github": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"] },
    "database": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-postgres"] },
    "playwright": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-playwright"] },
    // ... 11 more servers
  }
}
```

This works beautifully for 3-5 servers. But at 15+ servers, cracks appear:

1. **Context saturation:** Tool schemas consume 30-50% of Claude's context window before any actual work begins
2. **Sequential execution:** Multi-tool workflows execute one tool at a time, accumulating latency
3. **Intermediate data bloat:** Large datasets pass through the context window unnecessarily

These aren't bugs—they're architectural limitations of the direct-connection model.

We built AgentCards to explore four architectural concepts that address these limitations:

1. **Semantic Gateway Pattern** — Dynamic tool discovery via vector search
2. **DAG-Based Parallel Execution** — Breaking sequential bottlenecks with dependency graphs
3. **Speculative Execution** — Predicting and pre-executing workflows before they're requested
4. **Agent Code Sandboxing** — Shifting computation from protocol calls to local execution

Let's examine each concept, the trade-offs involved, and their implications for the MCP ecosystem.

---

## Concept 1: The Semantic Gateway Pattern

### From Static to Dynamic Tool Discovery

The MCP protocol defines a simple method for tool discovery:

```typescript
// Client → Server
{
  "method": "tools/list",
  "params": {}
}

// Server → Client
{
  "tools": [
    {
      "name": "read_file",
      "description": "Read the complete contents of a file...",
      "inputSchema": { /* JSON Schema */ }
    },
    // ... all other tools
  ]
}
```

Notice what's missing: **context about what the user is trying to do.**

The server has no choice but to return *all* its tools. If you have 15 MCP servers with an average of 45 tools each, that's 687 tool schemas loaded into Claude's context. At roughly 80-150 tokens per schema, we're looking at 55,000-103,000 tokens consumed before the first user message.

For Claude's 200,000 token context window, this represents **27-51% overhead just for tool definitions.**

This architectural decision made sense when MCP was new and servers were few. But it breaks down at scale. It's information asymmetry: the server doesn't know user intent, so it must send everything. The client must load everything to decide what's relevant.

### The Gateway Architecture

A gateway sits between Claude and your MCP servers:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    TRADITIONAL ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│                          ┌──────────────┐                              │
│                          │  Claude Code │                              │
│                          └───────┬──────┘                              │
│                                  │                                      │
│              ┌───────────────────┼───────────────────┐                 │
│              │                   │                   │                 │
│              ▼                   ▼                   ▼                 │
│    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐       │
│    │  Filesystem MCP │ │   GitHub MCP    │ │  Database MCP   │       │
│    │   (8 tools)     │ │   (12 tools)    │ │   (15 tools)    │       │
│    └─────────────────┘ └─────────────────┘ └─────────────────┘       │
│              │                   │                   │                 │
│              └───────────────────┴───────────────────┘                 │
│                                  │                                      │
│              All 35 tool schemas loaded in context                     │
│              Context usage: ~4,200 tokens (2.1% of 200K)               │
│              For 15 servers: ~60,000 tokens (30% of context!)          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                      GATEWAY ARCHITECTURE                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│                          ┌──────────────┐                              │
│                          │  Claude Code │                              │
│                          └───────┬──────┘                              │
│                                  │ Single MCP connection                │
│                                  ▼                                      │
│                    ┌─────────────────────────┐                         │
│                    │   AgentCards Gateway    │                         │
│                    ├─────────────────────────┤                         │
│                    │  🔍 Vector Search       │                         │
│                    │  📊 PGlite + pgvector   │                         │
│                    │  🧠 Semantic Discovery  │                         │
│                    │  ⚡ DAG Executor        │                         │
│                    └──────────┬──────────────┘                         │
│                               │ Proxy tool calls                        │
│              ┌────────────────┼────────────────┐                       │
│              │                │                │                        │
│              ▼                ▼                ▼                        │
│    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐       │
│    │  Filesystem MCP │ │   GitHub MCP    │ │  Database MCP   │       │
│    │   (8 tools)     │ │   (12 tools)    │ │   (15 tools)    │       │
│    └─────────────────┘ └─────────────────┘ └─────────────────┘       │
│                               │                                         │
│              ... + 12 more MCP servers (15 total)                      │
│                                                                         │
│    ┌────────────────────────────────────────────────────────────┐     │
│    │ Query: "Read configuration files"                          │     │
│    │ → Vector search identifies 3 relevant tools:               │     │
│    │   • filesystem:read_file                                   │     │
│    │   • filesystem:list_directory                              │     │
│    │   • json:parse                                             │     │
│    │                                                             │     │
│    │ Context usage: ~360 tokens (0.18%)                         │     │
│    │ vs. loading all 687 tools: ~60,000 tokens (30%)            │     │
│    │                                                             │     │
│    │ 🎯 Context reduction: 167x improvement                     │     │
│    └────────────────────────────────────────────────────────────┘     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

The gateway provides a single MCP endpoint to Claude while maintaining connections to all your actual MCP servers. But more importantly, it can make intelligent decisions about which tools to expose.

### Vector Embeddings as the Discovery Mechanism

Why vector search instead of traditional indexing?

Keyword-based approaches fail quickly:

```typescript
// User intent: "Read configuration files and parse them"
// Keyword search: "read" + "config" + "parse"

// Matches:
// ✓ filesystem:read_file (has "read")
// ? json:parse (has "parse" but no "config")

// Misses:
// ✗ yaml:load (relevant but different keywords)
// ✗ toml:parse (relevant but not matched)
// ✗ S3:get_object (could read configs from S3)
```

Semantic embeddings capture intent across vocabulary variations:

```typescript
// Embedding space (conceptual visualization):
query: "read configuration files and parse them"

Semantic similarity scores:
[0.94] filesystem:read_file
[0.89] json:parse
[0.87] yaml:load
[0.85] toml:parse
[0.81] S3:get_object
[0.78] config:get_value
[0.24] github:create_issue  ← Correctly excluded
[0.19] slack:send_message   ← Correctly excluded
```

The gateway generates embeddings for all tool schemas during initialization, then performs vector similarity search at runtime. Here's the implementation philosophy:

```typescript
// Initialization (one-time cost)
async function indexTools() {
  for (const server of mcpServers) {
    const tools = await server.listTools();

    for (const tool of tools) {
      // Combine name, description, and schema into searchable text
      const searchText = `
        ${tool.name}: ${tool.description}
        Parameters: ${JSON.stringify(tool.inputSchema)}
      `;

      // Generate embedding using local model (BGE-Large-EN-v1.5)
      const embedding = await embedder.embed(searchText);

      // Store in vector database (PGlite + pgvector)
      await db.query(`
        INSERT INTO tool_embeddings (server_id, tool_name, embedding, schema)
        VALUES ($1, $2, $3, $4)
      `, [server.id, tool.name, embedding, tool]);
    }
  }
}

// Runtime search (per query)
async function searchTools(userIntent: string, limit = 10) {
  const queryEmbedding = await embedder.embed(userIntent);

  const results = await db.query(`
    SELECT server_id, tool_name, schema,
           1 - (embedding <=> $1) as similarity
    FROM tool_embeddings
    WHERE 1 - (embedding <=> $1) > 0.6
    ORDER BY similarity DESC
    LIMIT $2
  `, [queryEmbedding, limit]);

  return results.map(r => r.schema);
}
```

### Local vs. Cloud Embeddings: A Trade-off Analysis

We chose local embeddings (Transformers.js + BGE-Large-EN-v1.5) over cloud APIs. Here's why:

**Local Embeddings (our choice):**
- ✅ Zero latency penalty (no network round-trip)
- ✅ Complete privacy (no data leaves the machine)
- ✅ Zero cost (no API fees)
- ✅ Works offline
- ⚠️ One-time setup cost (60s to embed 687 tools)
- ⚠️ Embedding quality: very good, not perfect

**Cloud Embeddings (OpenAI, Cohere, Voyage):**
- ✅ Best-in-class embedding quality
- ⚠️ 100-300ms latency per query
- ⚠️ Privacy concerns (tool schemas reveal system architecture)
- ⚠️ API costs scale with usage
- ⚠️ Network dependency

For a gateway that runs locally and handles potentially sensitive tool schemas, **privacy and latency trump marginal quality improvements.** The local model is "good enough" for tool retrieval—we rarely see relevant tools ranked below threshold.

### Should the MCP Protocol Support Semantic Queries?

This raises an interesting question: should semantic search be part of the MCP protocol itself?

**Current MCP spec:**
```typescript
interface ListToolsRequest {
  method: "tools/list";
  params?: {}; // No query parameter
}
```

**Hypothetical extension:**
```typescript
interface ListToolsRequest {
  method: "tools/list";
  params?: {
    query?: string;  // Semantic query for relevance filtering
    limit?: number;  // Max tools to return
  };
}
```

**Arguments for protocol extension:**
- Standardizes semantic discovery across implementations
- Enables smarter clients (Claude could optimize its own tool loading)
- Backward compatible (query parameter is optional)
- Servers can implement however they want (vector search, keywords, LLM-based, etc.)

**Arguments against:**
- Shifts complexity to every server implementation
- Not all servers have embedding capabilities
- Could fragment the ecosystem (some support it, others don't)
- Semantic search might not be the right primitive for all use cases

**Our approach: Gateway as middleware layer**

Instead of requiring all MCP servers to implement semantic search, the gateway provides this as a universal layer. Any existing MCP server benefits immediately without code changes. Servers remain simple. Complexity lives in one place.

This mirrors patterns from web infrastructure: nginx handles caching and load balancing so backend services don't have to. The MCP gateway handles tool discovery optimization so MCP servers don't have to.

---

## Concept 2: DAG-Based Parallel Execution

### Architecture Clarification: GraphRAG vs DAG

Before diving into parallel execution, it's critical to understand the distinction between two architectural components that work together:

**GraphRAG (Knowledge Graph)** — The complete knowledge base
- Stores ALL tools from ALL MCP servers (e.g., 687 tools)
- Contains historical workflow executions and their success/failure patterns
- Maintains relationships between tools (e.g., "filesystem:read often followed by json:parse")
- Holds embeddings for semantic search
- **Scope:** Global, all possibilities

**DAG (Directed Acyclic Graph)** — The specific workflow instance
- A concrete workflow for ONE specific task
- Contains only the 3-5 relevant tools for this request
- Explicitly defines dependencies (task B depends on task A)
- **Scope:** Local, single execution

```
┌────────────────────────────────────────────────────────┐
│ GRAPHRAG: All Possibilities (Knowledge Base)          │
│                                                        │
│ • 687 tools across 15 servers                         │
│ • 10,000+ historical executions                       │
│ • Tool relationships & patterns                       │
│ • Vector embeddings for search                        │
│                                                        │
│ Example relationships learned:                        │
│ - "filesystem:read" → "json:parse" (85% correlation)  │
│ - "git:log" → "text:summarize" (72% correlation)      │
│                                                        │
│ = THE KNOWLEDGE, not the execution                    │
└────────────────┬───────────────────────────────────────┘
                 │
                 │ User Intent: "Read config and create issue"
                 │
                 ▼
       ┌─────────────────────┐
       │  DAG SUGGESTER      │  ← Intelligence layer
       │                     │
       │ 1. Query GraphRAG   │
       │ 2. Find patterns    │
       │ 3. Predict workflow │
       │ 4. Build DAG        │
       └──────────┬──────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│ DAG: Specific Workflow Instance                         │
│                                                          │
│ tasks: [                                                 │
│   { id: "t1", tool: "filesystem:read_file" },           │
│   { id: "t2", tool: "json:parse", depends_on: ["t1"] }, │
│   { id: "t3", tool: "github:create_issue",              │
│     depends_on: ["t2"] }                                 │
│ ]                                                        │
│                                                          │
│ = THE EXECUTION PLAN, extracted from knowledge          │
└─────────────────────────────────────────────────────────┘
```

**Why this matters for Speculative Execution:**

Speculative execution is possible because:
1. **GraphRAG** learns patterns from historical workflows
2. **DAG Suggester** predicts which DAG to build for a new intent
3. **DAG Executor** runs the predicted DAG *before* the agent explicitly requests it
4. When agent arrives, results are already cached

Without GraphRAG (the knowledge), you can't predict which DAG to build.
Without DAG (the structure), you can't execute workflows in parallel or speculatively.

**They're complementary:**
- GraphRAG = "What workflows have worked before?"
- DAG Suggester = "Based on this intent, which workflow should I build?"
- DAG = "Here's the concrete plan to execute"
- DAG Executor = "Let me run this plan (possibly speculatively)"

Now let's explore how DAG-based execution breaks the sequential bottleneck.

---

### The Sequential Execution Bottleneck

MCP workflows today execute sequentially. Here's why:

```typescript
// Claude's execution model (conceptual)
async function executeWorkflow(tasks: Task[]) {
  const results = [];

  for (const task of tasks) {
    const result = await callTool(task.tool, task.arguments);
    results.push(result);
  }

  return results;
}
```

This seems reasonable until you consider workflows like this:

```typescript
// User request: "Read these 5 configuration files"
// Files: config.json, database.json, api.json, auth.json, features.json

// Execution timeline (sequential):
0.0s → 1.2s: Read config.json
1.2s → 2.3s: Read database.json
2.3s → 3.3s: Read api.json
3.3s → 4.6s: Read auth.json
4.6s → 5.7s: Read features.json

Total time: 5.7 seconds
```

But these reads are **completely independent.** They could happen in parallel:

```typescript
// Execution timeline (parallel):
0.0s → 1.2s: Read all 5 files simultaneously
             (longest file takes 1.2s)

Total time: 1.2 seconds
Speedup: 4.75x
```

Why doesn't this happen automatically? **Because the MCP protocol doesn't express dependencies between tool calls.**

Each tool call is atomic. The LLM must:
1. Make a tool call
2. Wait for the result
3. Incorporate result into context
4. Decide the next tool call
5. Repeat

This is by design. MCP keeps servers stateless and simple. Orchestration is left to the client (Claude). But it creates a fundamental bottleneck: even when tasks are independent, they execute serially.

### Introducing the DAG Execution Model

A **Directed Acyclic Graph (DAG)** explicitly represents dependencies between tasks:

```typescript
interface WorkflowDAG {
  tasks: Task[];
  dependencies: Map<TaskId, TaskId[]>;
}

// Example: Sequential workflow
const sequentialWorkflow = {
  tasks: [
    { id: "t1", tool: "filesystem:read_file", args: { path: "/config.json" } },
    { id: "t2", tool: "json:parse", args: { input: "$OUTPUT[t1]" } },
    { id: "t3", tool: "github:create_issue", args: { body: "$OUTPUT[t2]" } }
  ],
  dependencies: {
    "t1": [],      // No dependencies → can start immediately
    "t2": ["t1"],  // Depends on t1 → waits for t1 to complete
    "t3": ["t2"]   // Depends on t2 → waits for t2 to complete
  }
};

// Visual representation:
// t1 → t2 → t3
// (must execute sequentially)
```

Contrast with a parallel workflow:

```typescript
// Example: Parallel workflow
const parallelWorkflow = {
  tasks: [
    { id: "t1", tool: "filesystem:read_file", args: { path: "/config.json" } },
    { id: "t2", tool: "filesystem:read_file", args: { path: "/database.json" } },
    { id: "t3", tool: "filesystem:read_file", args: { path: "/api.json" } },
    { id: "t4", tool: "filesystem:read_file", args: { path: "/auth.json" } },
    { id: "t5", tool: "filesystem:read_file", args: { path: "/features.json" } }
  ],
  dependencies: {
    "t1": [], "t2": [], "t3": [], "t4": [], "t5": []
    // No inter-dependencies → all can execute in parallel
  }
};

// Visual representation:
// t1 ─┐
// t2 ─┤
// t3 ─┼─→ All execute simultaneously
// t4 ─┤
// t5 ─┘
```

### Execution via Topological Sort

The DAG executor uses topological sorting to identify "layers" of tasks that can execute in parallel:

```typescript
class DAGExecutor {
  async execute(workflow: WorkflowDAG): Promise<ExecutionResult> {
    // Build dependency graph
    const graph = this.buildGraph(workflow);

    // Topological sort → layers
    const layers = this.topologicalSort(graph);
    // layers = [[t1, t2, t3, t4, t5]] for parallel workflow
    // layers = [[t1], [t2], [t3]] for sequential workflow

    const results = new Map<TaskId, unknown>();

    // Execute each layer in parallel
    for (const layer of layers) {
      await Promise.all(
        layer.map(async (taskId) => {
          const task = workflow.tasks.find(t => t.id === taskId);

          // Resolve $OUTPUT[...] placeholders
          const resolvedArgs = this.resolveArguments(task.arguments, results);

          // Execute tool call
          const result = await this.callTool(task.tool, resolvedArgs);
          results.set(taskId, result);
        })
      );
    }

    return { results };
  }
}
```

### Dependency Resolution with $OUTPUT References

Tasks often need results from previous tasks. We use a simple placeholder syntax:

```typescript
// Task that depends on a previous result
{
  id: "t2",
  tool: "json:parse",
  arguments: {
    input: "$OUTPUT[t1]"  // Reference to t1's result
  },
  depends_on: ["t1"]
}

// Executor resolves at runtime:
function resolveArguments(
  args: Record<string, any>,
  results: Map<TaskId, any>
): Record<string, any> {
  const resolved = { ...args };

  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "string" && value.startsWith("$OUTPUT[")) {
      const taskId = value.match(/\$OUTPUT\[(.+)\]/)?.[1];
      if (taskId) {
        resolved[key] = results.get(taskId);
      }
    }
  }

  return resolved;
}
```

This supports complex references using JSONPath-style syntax:

```typescript
{
  arguments: {
    title: "$OUTPUT[t1].config.version",           // Deep property access
    tags: "$OUTPUT[t2][0].labels",                 // Array indexing
    summary: "$OUTPUT[t3].data.summary.text"       // Nested objects
  }
}
```

### When Does Parallel Execution Matter?

We benchmarked various workflow patterns:

| Workflow Type | Tasks | Sequential | Parallel | Speedup |
|--------------|-------|------------|----------|---------|
| Independent file reads | 5 | 5.7s | 1.2s | **4.75x** |
| Parallel API calls (I/O bound) | 8 | 12.4s | 2.1s | **5.90x** |
| Mixed (some dependencies) | 10 | 15.2s | 4.8s | **3.17x** |
| Purely sequential chain | 5 | 5.7s | 5.7s | **1.00x** |
| Fan-out then fan-in | 12 | 18.9s | 4.2s | **4.50x** |

Key insight: **Parallelization gains are proportional to workflow "width"** (number of independent branches).

**Visual Comparison: Sequential vs. Parallel Execution**

```
┌─────────────────────────────────────────────────────────────────────────┐
│  SEQUENTIAL EXECUTION (Traditional MCP)                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Workflow: Read 5 config files                                         │
│                                                                         │
│  t=0.0s ─────► read config1 ─────► [1.2s] ──────┐                      │
│                                                  │                      │
│  t=1.2s ─────► read config2 ─────► [1.1s] ──────┤                      │
│                                                  │                      │
│  t=2.3s ─────► read config3 ─────► [1.0s] ──────┤  Sequential          │
│                                                  │  Waiting             │
│  t=3.3s ─────► read config4 ─────► [1.3s] ──────┤                      │
│                                                  │                      │
│  t=4.6s ─────► read config5 ─────► [1.1s] ──────┘                      │
│                                                                         │
│  t=5.7s ────────────────────────────► DONE                             │
│                                                                         │
│  Total time: 5.7 seconds                                               │
│  CPU idle time: ~80% (waiting for I/O)                                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  PARALLEL EXECUTION (DAG-Based)                                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Workflow: Read 5 config files (same tasks, parallelized)              │
│                                                                         │
│                ┌─► read config1 ─► [1.2s] ──┐                          │
│                │                             │                          │
│                ├─► read config2 ─► [1.1s] ──┤                          │
│                │                             │                          │
│  t=0.0s ───────┼─► read config3 ─► [1.0s] ──┼─► DONE (all complete)   │
│                │                             │                          │
│                ├─► read config4 ─► [1.3s] ◄─┘   (longest task: 1.3s)  │
│                │                                                        │
│                └─► read config5 ─► [1.1s]                              │
│                                                                         │
│  t=1.3s ────────────────────────────► DONE                             │
│                                                                         │
│  Total time: 1.3 seconds (max of all parallel tasks)                   │
│  Speedup: 4.4x faster                                                  │
│  CPU utilization: ~95% (all cores working)                             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  MIXED WORKFLOW (Fan-out, Fan-in Pattern)                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Workflow: List files → Read in parallel → Parse → Aggregate           │
│                                                                         │
│                         ┌─► read f1 ─► [0.8s] ──┐                      │
│                         │                        │                      │
│  t=0.0s ► list files ───┼─► read f2 ─► [0.9s] ──┼─► parse all ──┐     │
│           [0.5s]        │                        │   [0.3s]      │     │
│                         └─► read f3 ─► [0.7s] ──┘               │     │
│                                                                  │     │
│  t=1.4s ─────────────────────────────────────────────► aggregate│     │
│                                                         [0.2s]   │     │
│                                                                  │     │
│  t=1.6s ───────────────────────────────────────────────────► DONE     │
│                                                                         │
│  Layer 0: list (1 task)          → 0.5s                                │
│  Layer 1: read (3 parallel)      → 0.9s (max)                          │
│  Layer 2: parse (1 task)         → 0.3s                                │
│  Layer 3: aggregate (1 task)     → 0.2s                                │
│                                                                         │
│  Total: 1.9s                                                           │
│  Sequential would be: 0.5 + (0.8+0.9+0.7) + 0.3 + 0.2 = 3.4s          │
│  Speedup: 1.8x                                                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

Real-world workflows typically have 30-50% parallelizable tasks. Even modest workflows see 2-3x speedups. Highly parallel workflows (reading multiple files, calling multiple APIs) can see 5-6x improvements.

### Complex Example: Fan-Out, Fan-In Pattern

```typescript
// Workflow: "Read 5 configs, parse each, then aggregate into one summary"
const fanOutFanIn = {
  tasks: [
    // Layer 0: Read 5 files in parallel
    { id: "read1", tool: "fs:read", args: { path: "/c1.json" } },
    { id: "read2", tool: "fs:read", args: { path: "/c2.json" } },
    { id: "read3", tool: "fs:read", args: { path: "/c3.json" } },
    { id: "read4", tool: "fs:read", args: { path: "/c4.json" } },
    { id: "read5", tool: "fs:read", args: { path: "/c5.json" } },

    // Layer 1: Parse 5 files in parallel
    { id: "parse1", tool: "json:parse", args: { input: "$OUTPUT[read1]" }, depends_on: ["read1"] },
    { id: "parse2", tool: "json:parse", args: { input: "$OUTPUT[read2]" }, depends_on: ["read2"] },
    { id: "parse3", tool: "json:parse", args: { input: "$OUTPUT[read3]" }, depends_on: ["read3"] },
    { id: "parse4", tool: "json:parse", args: { input: "$OUTPUT[read4]" }, depends_on: ["read4"] },
    { id: "parse5", tool: "json:parse", args: { input: "$OUTPUT[read5]" }, depends_on: ["read5"] },

    // Layer 2: Aggregate results (sequential, waits for all parses)
    {
      id: "aggregate",
      tool: "json:merge",
      args: {
        inputs: [
          "$OUTPUT[parse1]",
          "$OUTPUT[parse2]",
          "$OUTPUT[parse3]",
          "$OUTPUT[parse4]",
          "$OUTPUT[parse5]"
        ]
      },
      depends_on: ["parse1", "parse2", "parse3", "parse4", "parse5"]
    }
  ]
};

// Execution timeline:
// Layer 0 (parallel): read1, read2, read3, read4, read5 → 1.2s
// Layer 1 (parallel): parse1, parse2, parse3, parse4, parse5 → 0.3s
// Layer 2 (sequential): aggregate → 0.2s
// Total: 1.7s

// Sequential baseline:
// (read1 → parse1) → (read2 → parse2) → ... → (read5 → parse5) → aggregate
// Total: 1.2s + 0.3s + 1.1s + 0.3s + 1.0s + 0.2s + 1.3s + 0.3s + 1.1s + 0.2s + 0.2s = 8.2s

// Speedup: 4.82x
```

### Speculative Execution: Predicting Workflows Before They're Requested

DAG execution enables parallelization, but there's still latency: the agent must **construct the DAG** before execution begins. What if we could start executing before the agent even decides what to do?

This is **speculative execution**—using the dependency graph and intent analysis to predict and pre-execute tool calls.

**The Core Idea:**

```
┌─────────────────────────────────────────────────────────────────────────┐
│  TRADITIONAL FLOW (Agent-Driven)                                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  User: "Read config.json and create GitHub issue with version"         │
│                                                                         │
│  t=0.0s ────► Agent Thinking ──────────► [500ms] ──┐                   │
│               "I need to read file first"           │                   │
│                                                     │                   │
│  t=0.5s ────────────────────────────────────────────┴──► Execute       │
│                                                           read_file     │
│                                                           [800ms]       │
│                                                              │          │
│  t=1.3s ────► Agent Thinking ──────────► [200ms] ──────────┴──┐        │
│               "Parse JSON to get version"                     │        │
│                                                               │        │
│  t=1.5s ──────────────────────────────────────────────────────┴─► Exec │
│                                                                  parse  │
│                                                                  [600ms]│
│                                                                     │   │
│  t=2.1s ────► Agent Thinking ──────────► [150ms] ──────────────────┴─┐ │
│               "Create GitHub issue now"                              │ │
│                                                                      │ │
│  t=2.25s ────────────────────────────────────────────────────────────┴►│
│                                                                  create │
│                                                                  [1.2s] │
│                                                                    │    │
│  t=3.45s ─────────────────────────────────────────────────────────┘    │
│                                            DONE                         │
│                                                                         │
│  Total time: 3.45s                                                     │
│  - Agent thinking: 850ms (25%)                                         │
│  - Tool execution: 2,600ms (75%)                                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  SPECULATIVE EXECUTION FLOW (Prediction-Driven)                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  User: "Read config.json and create GitHub issue with version"         │
│                                                                         │
│  t=0.0s ────► Gateway Predicts DAG ─► [100ms] ──┐                      │
│               Confidence: 0.89 (high)            │                      │
│               DAG: read → parse → create         │                      │
│                                                  │                      │
│               ┌──────────────────────────────────┘                      │
│               │  SPECULATIVE EXECUTION STARTS                           │
│               │  (while agent is thinking)                              │
│               ▼                                                         │
│  t=0.1s ────► Execute read_file ─────► [800ms] ──┐                     │
│               (cached for later)                  │                     │
│                                                   │                     │
│               ┌─ Agent Thinking ──────────────────┤                     │
│               │  [500ms in background]            │                     │
│               │  "I need to read file..."         │                     │
│               └───────────────────────────────────┘                     │
│                                                   │                     │
│  t=0.5s ─────► Agent: "Read file please"         │                     │
│                Gateway: "Already done! ✓"         │                     │
│                Returns cached result ────────►[0ms - instant]           │
│                                                                         │
│  t=0.9s ─────► Execute json:parse ──────► [200ms] ──┐                  │
│                (speculative, on cached data)         │                  │
│                                                      │                  │
│                ┌─ Agent Thinking ───────────────────┤                  │
│                │  [100ms in background]              │                  │
│                │  "Parse to get version..."          │                  │
│                └─────────────────────────────────────┘                  │
│                                                      │                  │
│  t=1.0s ─────► Agent: "Parse please"                │                  │
│                Gateway: "Already done! ✓"            │                  │
│                Returns cached result ────────►[0ms - instant]           │
│                                                                         │
│  t=1.1s ─────► Agent: "Create issue"                                   │
│                Execute github:create_issue ──► [400ms]                 │
│                (NOT speculative - has side effects)    │                │
│                                                        │                │
│  t=1.5s ───────────────────────────────────────────────┘                │
│                                            DONE                         │
│                                                                         │
│  Total time: 1.5s                                                      │
│  - Speculative overhead: 100ms (DAG prediction)                        │
│  - Wasted computation: 0ms (all predictions correct)                   │
│  - Time saved: 1.95s (56% reduction)                                   │
│                                                                         │
│  🎯 Result: Agent receives instant responses for predicted steps       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  FAILED PREDICTION SCENARIO (Partial Win)                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  User: "Read config.json and summarize it"                             │
│                                                                         │
│  t=0.0s ────► Gateway Predicts:                                        │
│               • read_file ✓                                             │
│               • json:parse ✓                                            │
│               • summarize_json ✗ (agent chose different tool!)         │
│                                                                         │
│  t=0.1s ────► Executes read_file [800ms] ──► Cached ✓                  │
│                                                                         │
│  t=0.9s ────► Executes json:parse [200ms] ──► Cached ✓                 │
│               (but agent won't use this!)                               │
│                                                                         │
│  t=1.1s ────► Agent: "Read file"                                       │
│               Gateway: "Here! ✓" [instant]                              │
│                                                                         │
│  t=1.1s ────► Agent: "Use custom_summarize instead"                    │
│               Execute custom_summarize [300ms]                          │
│                                                                         │
│  t=1.4s ───────────────────────────────────► DONE                      │
│                                                                         │
│  Result:                                                                │
│  - Wasted: json:parse execution (200ms)                                │
│  - Saved: read_file time (800ms)                                       │
│  - Net benefit: +600ms saved despite misprediction                     │
│                                                                         │
│  💡 Partial predictions still provide value!                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**How It Works:**

```typescript
class SpeculativeExecutor {
  async processIntent(intent: string): Promise<ExecutionMode> {
    // Step 1: Use GraphRAG to predict likely workflow
    const predictedDAG = await this.dagSuggester.suggestWorkflow(intent);

    // Step 2: Calculate confidence score
    const confidence = this.calculateConfidence(predictedDAG, intent);

    // Step 3: Decide execution strategy based on confidence
    if (confidence > 0.85) {
      // High confidence → Execute speculatively
      console.log(`🚀 Speculative execution (confidence: ${confidence})`);

      const results = await this.dagExecutor.execute(predictedDAG);

      return {
        mode: "speculative_execution",
        results: results,
        confidence: confidence,
        execution_time_ms: results.executionTimeMs
      };
    } else if (confidence > 0.65) {
      // Medium confidence → Suggest DAG, let agent decide
      return {
        mode: "suggestion",
        dagStructure: predictedDAG,
        confidence: confidence,
        explanation: "Suggested workflow based on intent analysis"
      };
    } else {
      // Low confidence → Require explicit workflow
      return {
        mode: "explicit_required",
        confidence: confidence,
        explanation: "Intent too ambiguous for automatic workflow generation"
      };
    }
  }

  private calculateConfidence(dag: DAGStructure, intent: string): number {
    // Factors affecting confidence:
    // 1. Semantic similarity between intent and predicted tools
    // 2. Historical accuracy (have similar intents led to this DAG before?)
    // 3. DAG complexity (simpler DAGs = higher confidence)
    // 4. Dependency ambiguity (clear dependencies = higher confidence)

    let confidence = 0.5; // Base

    // Factor 1: Tool relevance
    const toolRelevance = this.measureToolRelevance(dag, intent);
    confidence += toolRelevance * 0.3;

    // Factor 2: Historical accuracy
    const historicalAccuracy = this.getHistoricalAccuracy(intent);
    confidence += historicalAccuracy * 0.2;

    // Factor 3: Simplicity bonus
    if (dag.tasks.length <= 5) {
      confidence += 0.1;
    }

    // Factor 4: Dependency clarity
    const dependencyCertainty = this.analyzeDependencies(dag);
    confidence += dependencyCertainty * 0.15;

    return Math.min(confidence, 0.99); // Cap at 99%
  }
}
```

**Example: File Processing Intent**

```typescript
// User intent: "Read all JSON configs and summarize versions"

// Step 1: Intent analysis
const intent = "Read all JSON configs and summarize versions";
const embedding = await embedder.embed(intent);

// Step 2: Vector search identifies relevant tools
const relevantTools = await vectorSearch.searchTools(embedding);
// Returns: [filesystem:list, filesystem:read, json:parse]

// Step 3: GraphRAG constructs dependency graph
const predictedDAG = {
  tasks: [
    {
      id: "list",
      tool: "filesystem:list_directory",
      args: { path: "/configs" }
    },
    {
      id: "read_all",
      tool: "parallel_read",  // Meta-task: read multiple files
      args: { files: "$OUTPUT[list].filter(f => f.endsWith('.json'))" },
      depends_on: ["list"]
    },
    {
      id: "parse_all",
      tool: "parallel_parse",
      args: { inputs: "$OUTPUT[read_all]" },
      depends_on: ["read_all"]
    },
    {
      id: "summarize",
      tool: "aggregate_versions",
      args: { configs: "$OUTPUT[parse_all]" },
      depends_on: ["parse_all"]
    }
  ]
};

// Step 4: Confidence calculation
// - Tool relevance: 0.92 (high semantic match)
// - Historical accuracy: 0.78 (similar intents worked before)
// - Simplicity: +0.1 (only 4 tasks)
// - Dependency clarity: 0.85 (clear sequential dependencies)
// → Total confidence: 0.87

// Step 5: Execute speculatively (confidence > 0.85)
const results = await executor.execute(predictedDAG);

// Agent arrives at the conversation with results already available
Agent: "Let me read the config files..."
Gateway: "Already done! Here are the 15 configs."
Agent: "Parse them..."
Gateway: "Already parsed! Here's the data."
Agent: "Summarize versions..."
Gateway: "Here's the summary: [results]"

// Total latency: 1.2s (speculative execution)
// vs. 6.8s (traditional sequential: agent thinks → execute → repeat)
// Speedup: 5.67x
```

**The Risk-Reward Trade-off:**

Speculative execution is a bet:

✅ **When prediction is correct (>85% confidence):**
- Massive latency reduction (5-10x faster)
- Better user experience (instant responses)
- More efficient use of idle time (execute while agent thinks)

❌ **When prediction is wrong (<85% confidence):**
- Wasted computation (executed unnecessary tools)
- Potential side effects (if tools aren't idempotent)
- Context pollution (wrong results in cache)

**Safety Mechanisms:**

```typescript
class SpeculativeExecutor {
  // Only execute idempotent tools speculatively
  private readonly SAFE_TOOLS = [
    "filesystem:read_file",      // ✅ Read-only
    "filesystem:list_directory", // ✅ Read-only
    "json:parse",                // ✅ Pure function
    "yaml:load",                 // ✅ Pure function
    "github:get_issue",          // ✅ Read-only API
  ];

  private readonly UNSAFE_TOOLS = [
    "filesystem:write_file",     // ❌ Side effects
    "github:create_issue",       // ❌ Creates resources
    "database:execute",          // ❌ Mutates state
    "slack:send_message",        // ❌ External actions
  ];

  canExecuteSpeculatively(task: Task): boolean {
    // Only execute if:
    // 1. Tool is in safe list (read-only/idempotent)
    // 2. No arguments suggest side effects
    // 3. Confidence threshold met

    if (this.UNSAFE_TOOLS.includes(task.tool)) {
      return false;
    }

    if (!this.SAFE_TOOLS.includes(task.tool)) {
      // Unknown tool → check if it looks safe
      if (task.tool.includes("create") || task.tool.includes("delete")) {
        return false;
      }
    }

    return true;
  }

  async execute(dag: DAGStructure): Promise<ExecutionResult> {
    const safeTasks = dag.tasks.filter(t => this.canExecuteSpeculatively(t));
    const unsafeTasks = dag.tasks.filter(t => !this.canExecuteSpeculatively(t));

    // Execute safe tasks speculatively
    const speculativeResults = await this.executeSafe(safeTasks);

    // Cache results for agent to use
    this.resultCache.set(dag.id, speculativeResults);

    // Wait for agent confirmation before executing unsafe tasks
    return {
      speculative: speculativeResults,
      pending: unsafeTasks,
      requiresConfirmation: unsafeTasks.length > 0
    };
  }
}
```

**Historical Learning:**

The gateway can learn from past predictions to improve accuracy:

```typescript
class PredictionLearner {
  async recordPrediction(
    intent: string,
    predictedDAG: DAGStructure,
    actualDAG: DAGStructure,
    wasCorrect: boolean
  ): Promise<void> {
    // Store in database for future reference
    await db.query(`
      INSERT INTO prediction_history (
        intent_embedding,
        predicted_dag,
        actual_dag,
        was_correct,
        confidence_score,
        execution_time_saved
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      await embedder.embed(intent),
      predictedDAG,
      actualDAG,
      wasCorrect,
      this.lastConfidence,
      this.timeSaved
    ]);
  }

  async getHistoricalAccuracy(intent: string): Promise<number> {
    const embedding = await embedder.embed(intent);

    // Find similar past intents
    const similar = await db.query(`
      SELECT was_correct
      FROM prediction_history
      WHERE 1 - (intent_embedding <=> $1) > 0.7
      ORDER BY created_at DESC
      LIMIT 20
    `, [embedding]);

    if (similar.length === 0) {
      return 0.5; // No history → neutral confidence
    }

    const accuracy = similar.filter(r => r.was_correct).length / similar.length;
    return accuracy;
  }
}
```

**Performance Impact:**

Real benchmark from AgentCards:

```
Scenario: "Read config.json, parse it, check if version > 2.0, create GitHub issue if true"

┌─────────────────────┬──────────────┬──────────────┬──────────┐
│ Approach            │ Total Time   │ Agent Waits  │ Speedup  │
├─────────────────────┼──────────────┼──────────────┼──────────┤
│ Sequential MCP      │ 6.8s         │ 6.8s         │ 1.0x     │
│ (baseline)          │              │              │          │
├─────────────────────┼──────────────┼──────────────┼──────────┤
│ DAG Parallel        │ 3.2s         │ 3.2s         │ 2.1x     │
│ (manual DAG)        │              │              │          │
├─────────────────────┼──────────────┼──────────────┼──────────┤
│ Speculative Exec    │ 1.2s         │ 0.2s         │ 5.7x     │
│ (predicted DAG)     │ (1.0s idle)  │ (agent think)│          │
└─────────────────────┴──────────────┴──────────────┴──────────┘

Breakdown of speculative execution:
- t=0.0s: Intent received, prediction starts
- t=0.1s: DAG predicted (confidence: 0.89)
- t=0.1s: Speculatively execute t1 (read file)
- t=0.5s: Agent finishes thinking, requests t1
- t=0.5s: Gateway returns cached result (instant)
- t=0.6s: Agent requests t2 (parse), already executing
- t=0.7s: Gateway returns cached result (instant)
- t=0.8s: Agent requests t3 (version check)
- t=1.0s: Execute t3 (not safe to speculate - conditional logic)
- t=1.2s: Complete

Time saved: 5.6s (82% reduction)
```

**When Speculative Execution Fails:**

```typescript
// Scenario: Prediction was wrong

User intent: "Read config.json and summarize it"
Gateway predicts: [read, parse, summarize]
Gateway speculatively executes: read ✓, parse ✓

Agent decides: "Actually, I'll use a different summarization method"
Agent requests: custom_summarize (not in predicted DAG)

// Result:
// - Wasted: parse operation (wasn't needed)
// - Cost: ~0.2s of computation
// - Benefit: Still saved time on read operation (0.8s)
// - Net: +0.6s saved despite misprediction

// This is acceptable because:
// 1. Read operation was correctly predicted (partial win)
// 2. Wasted computation was minor (idempotent, cheap)
// 3. Overall still faster than baseline
```

**Adaptive Threshold Learning:**

A sophisticated implementation would learn optimal confidence thresholds from historical execution data:

```typescript
class AdaptiveThresholdManager {
  // Track recent executions in sliding window
  private executionHistory: ExecutionRecord[] = [];

  adjustThresholds(): void {
    // Calculate false positive rate (speculative executions that failed)
    const falsePositives = speculativeExecs.filter(e => !e.success).length;
    const fpRate = falsePositives / speculativeExecs.length;

    if (fpRate > 0.2) {
      // Too many failures → Increase threshold (be more conservative)
      this.suggestionThreshold += learningRate * fpRate;
    }

    // Calculate false negative rate (unnecessary manual confirmations)
    const falseNegatives = suggestions.filter(
      e => e.userAccepted && e.confidence >= (threshold - 0.1)
    ).length;
    const fnRate = falseNegatives / suggestions.length;

    if (fnRate > 0.3) {
      // Too many confirmations → Decrease threshold (be more aggressive)
      this.suggestionThreshold -= learningRate * fnRate;
    }
  }
}
```

**Three-Tier Confidence Strategy:**

Instead of binary (execute or not), use graduated response:

```typescript
async processIntent(intent: string): Promise<ExecutionMode> {
  const predicted = await predictWorkflow(intent);
  const confidence = calculateConfidence(predicted);

  if (confidence < 0.50) {
    // Tier 1: Low confidence → Require explicit workflow
    return { mode: "explicit_required", explanation: "Intent unclear" };
  } else if (confidence < 0.75) {
    // Tier 2: Medium confidence → Show suggestion for approval
    return { mode: "suggestion", dagStructure: predicted };
  } else {
    // Tier 3: High confidence → Execute speculatively
    const results = await executeDAG(predicted);
    return { mode: "speculative_execution", results };
  }
}
```

This approach balances automation (high confidence) with safety (low confidence requires human confirmation).

---

## Concept 3: Agent Code Sandboxing

### Beyond Tool Calls: Local Computation

The MCP paradigm is fundamentally about **tool calls**—the agent requests, the server executes:

```typescript
// Agent wants to process files
Agent: "List all files in /configs"
→ MCP call: filesystem:list_directory({ path: "/configs" })
→ Returns: ["app.json", "db.json", ..., "config-687.json"]
→ Result size: 2,400 tokens

Agent: "Filter to only .json files"
→ Agent must process 2,400 tokens in its context
→ Or make another tool call with specific filters
```

This model has a hidden inefficiency: **intermediate results bloat the context.**

Now consider an alternative paradigm—**code execution:**

```typescript
// Agent writes code, gateway executes locally
Agent generates TypeScript:
  const files = await listDirectory("/configs");
  const jsonFiles = files.filter(f => f.endsWith(".json"));
  return jsonFiles;

→ Gateway executes in Deno sandbox
→ Returns: ["app.json", "db.json", "auth.json"]
→ Result size: 80 tokens

// 30x context reduction
```

The key difference: **computation happens locally.** Only the final result enters the context.

### When Is Sandboxing Better Than Tool Calls?

Not always. Here's a decision matrix:

**✅ Sandbox execution wins:**
- **Large datasets:** 1MB+ raw data → filter/aggregate to <1KB summary
- **Multi-step transformations:** 5+ operations on the same data
- **Complex filtering logic:** Conditions that would require multiple tool calls
- **Sensitive data:** Process locally, return only aggregates (privacy preservation)
- **Iterative algorithms:** Loops, recursion, stateful processing

**❌ Tool calls win:**
- **Simple operations:** Read one file, call one API
- **External APIs:** GitHub, Slack, databases (can't run in sandbox)
- **Stateful operations:** Database transactions, file writes with locks
- **One-off queries:** No repeated processing

Example scenarios:

```typescript
// Scenario 1: Read one file
// Tool call: 1 round-trip, 1,200 tokens
// Sandbox: 1 round-trip + execution overhead, 1,200 tokens
// Winner: Tool call (simpler, no overhead)

// Scenario 2: Read 50 files, extract version numbers, aggregate
// Tool calls: 51 round-trips (50 reads + 1 aggregate), 75,000 tokens
// Sandbox: 1 round-trip, 500 tokens (just version list)
// Winner: Sandbox (50x fewer tokens, 1 round-trip vs 51)

// Scenario 3: Create GitHub issue
// Tool call: 1 round-trip, works
// Sandbox: Can't access GitHub API (not in sandbox)
// Winner: Tool call (only option)
```

### Security: The Sandbox Challenge

Why not just use JavaScript's `eval()`?

```typescript
// ❌ EXTREMELY DANGEROUS
const agentCode = await llm.generateCode();
eval(agentCode);

// Agent code can:
// - Access all files (read /etc/passwd, ~/.ssh/id_rsa)
// - Make network requests (exfiltrate data)
// - Execute shell commands (rm -rf /)
// - Crash the process (process.exit(1))
```

We need isolation. But how much, and at what cost?

**Isolation Options:**

| Approach | Security | Startup Latency | Runtime Overhead | Complexity |
|----------|----------|-----------------|------------------|------------|
| **VM** (Firecracker) | ★★★★★ Excellent | ⚠️ 1-2 seconds | ★★★★ Low | ⚠️ High |
| **Container** (Docker) | ★★★★ Very good | ⚠️ 100-500ms | ★★★★ Low | ⚠️ High |
| **WASM** (Wasmer/Wasmtime) | ★★★★ Very good | ★★★★★ <10ms | ★★★★★ None | ★★★ Medium |
| **Deno sandbox** | ★★★★ Very good | ★★★★★ <10ms | ★★★★★ None | ★★ Low |
| Node.js vm2 | ⚠️ Poor (escape vectors) | ★★★★★ <1ms | ★★★★★ None | ★★ Low |

**Why Deno?**

Deno provides **capability-based security** with granular permissions:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  DENO SANDBOX ARCHITECTURE                                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  Agent-Generated Code                                             │ │
│  │  ┌─────────────────────────────────────────────────────────────┐  │ │
│  │  │ const files = await listDirectory("/configs");              │  │ │
│  │  │ const configs = await Promise.all(                          │  │ │
│  │  │   files.map(f => readFile(f).then(JSON.parse))              │  │ │
│  │  │ );                                                           │  │ │
│  │  │ return configs.map(c => ({ name: c.name, version: c.ver }));│  │ │
│  │  └─────────────────────────────────────────────────────────────┘  │ │
│  └────────────────────────┬──────────────────────────────────────────┘ │
│                           │ Inject MCP client wrappers                  │
│                           ▼                                             │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  Injected MCP Tool Wrappers (auto-generated)                      │ │
│  │  ┌─────────────────────────────────────────────────────────────┐  │ │
│  │  │ async function listDirectory(path) {                        │  │ │
│  │  │   return await __MCP_CALL__("filesystem:list", { path });   │  │ │
│  │  │ }                                                            │  │ │
│  │  │ async function readFile(path) {                             │  │ │
│  │  │   return await __MCP_CALL__("filesystem:read", { path });   │  │ │
│  │  │ }                                                            │  │ │
│  │  └─────────────────────────────────────────────────────────────┘  │ │
│  └────────────────────────┬──────────────────────────────────────────┘ │
│                           │ Execute in Deno subprocess                  │
│                           ▼                                             │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  Deno Subprocess (Isolated)                                       │ │
│  │                                                                   │ │
│  │  Permissions:                                                     │ │
│  │  ✅ --allow-read=/configs      (only /configs directory)         │ │
│  │  ✅ --allow-net=localhost:9000 (only gateway MCP proxy)          │ │
│  │  ❌ NO --allow-write            (cannot write files)             │ │
│  │  ❌ NO --allow-run              (cannot spawn processes)         │ │
│  │  ❌ NO --allow-env              (cannot read env vars)           │ │
│  │                                                                   │ │
│  │  Limits:                                                          │ │
│  │  ⏱️  Timeout: 5 seconds                                          │ │
│  │  💾 Memory: 100MB max                                            │ │
│  │                                                                   │ │
│  └────────────────────────┬──────────────────────────────────────────┘ │
│                           │ __MCP_CALL__ proxies to gateway             │
│                           ▼                                             │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  Gateway MCP Proxy (localhost:9000)                               │ │
│  │                                                                   │ │
│  │  POST /call                                                       │ │
│  │  { tool: "filesystem:list", args: { path: "/configs" } }         │ │
│  │           │                                                       │ │
│  │           ▼                                                       │ │
│  │  Forward to actual MCP server                                     │ │
│  │           │                                                       │ │
│  │           ▼                                                       │ │
│  │  ┌─────────────────┐                                             │ │
│  │  │ Filesystem MCP  │  Execute with full permissions               │ │
│  │  │ Server          │  (gateway has filesystem access)             │ │
│  │  └─────────────────┘                                             │ │
│  │           │                                                       │ │
│  │           ▼                                                       │ │
│  │  Return result to sandbox                                         │ │
│  │                                                                   │ │
│  └────────────────────────┬──────────────────────────────────────────┘ │
│                           │                                             │
│                           ▼                                             │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  PII Detection Layer                                              │ │
│  │                                                                   │ │
│  │  Scan results for:                                                │ │
│  │  • Email addresses    (regex patterns)                            │ │
│  │  • API keys           (entropy analysis)                          │ │
│  │  • Credit cards       (Luhn algorithm)                            │ │
│  │  • SSN, phone numbers (pattern matching)                          │ │
│  │                                                                   │ │
│  │  Found: 2 email addresses → [REDACTED]                            │ │
│  │                                                                   │ │
│  └────────────────────────┬──────────────────────────────────────────┘ │
│                           │                                             │
│                           ▼                                             │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  Final Result (Safe for LLM Context)                              │ │
│  │                                                                   │ │
│  │  [{                                                               │ │
│  │    name: "app-config",                                            │ │
│  │    version: "2.1.0"                                               │ │
│  │  }, {                                                             │ │
│  │    name: "db-config",                                             │ │
│  │    version: "1.5.3"                                               │ │
│  │  }]                                                               │ │
│  │                                                                   │ │
│  │  Context usage: ~120 tokens (vs. 15,000+ for raw files)          │ │
│  │  🎯 125x context reduction                                        │ │
│  │                                                                   │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

Security Boundaries:
┌────────────────┐
│ Agent Code     │  Isolated subprocess, minimal permissions
├────────────────┤
│ MCP Proxy      │  Controls access to MCP tools
├────────────────┤
│ PII Detection  │  Prevents sensitive data leakage
├────────────────┤
│ LLM Context    │  Receives only sanitized summaries
└────────────────┘
```

```typescript
// Deno subprocess with explicit permissions
const sandbox = await Deno.run({
  cmd: ["deno", "run",
    "--allow-read=/configs",      // Can ONLY read /configs
    "--allow-write=/tmp/output",  // Can ONLY write to /tmp/output
    // NO --allow-net (network completely blocked)
    // NO --allow-run (can't spawn subprocesses)
    // NO --allow-env (can't read environment variables)
    "agent_code.ts"
  ]
});
```

This gives us:
- **Granular control:** Per-directory, per-domain, per-capability
- **Deny-by-default:** Everything is forbidden unless explicitly allowed
- **Runtime enforcement:** Not just process isolation, but OS-level capability restrictions
- **Fast startup:** <10ms overhead vs. containers' 100-500ms
- **TypeScript native:** No compilation step, agent code runs directly

### Implementation: The Sandbox Executor

```typescript
class CodeSandbox {
  async execute(options: SandboxOptions): Promise<SandboxResult> {
    const {
      code,
      permissions = {},
      timeout = 5000,
      memoryLimit = 100_000_000  // 100MB
    } = options;

    // Write code to temporary file
    const tempFile = await Deno.makeTempFile({ suffix: ".ts" });
    await Deno.writeTextFile(tempFile, code);

    // Build permission flags
    const permissionFlags = this.buildPermissionFlags(permissions);

    // Execute in isolated Deno subprocess
    const process = Deno.run({
      cmd: ["deno", "run", ...permissionFlags, tempFile],
      stdout: "piped",
      stderr: "piped"
    });

    // Timeout enforcement
    const timeoutId = setTimeout(() => {
      process.kill("SIGTERM");
    }, timeout);

    try {
      const [status, stdout, stderr] = await Promise.all([
        process.status(),
        process.output(),
        process.stderrOutput()
      ]);

      clearTimeout(timeoutId);

      if (!status.success) {
        throw new Error(`Sandbox execution failed: ${new TextDecoder().decode(stderr)}`);
      }

      return {
        output: new TextDecoder().decode(stdout),
        executionTimeMs: performance.now() - startTime
      };
    } finally {
      await Deno.remove(tempFile);
      process.close();
    }
  }

  private buildPermissionFlags(permissions: Permissions): string[] {
    const flags: string[] = [];

    if (permissions.read) {
      for (const path of permissions.read) {
        flags.push(`--allow-read=${path}`);
      }
    }

    if (permissions.write) {
      for (const path of permissions.write) {
        flags.push(`--allow-write=${path}`);
      }
    }

    if (permissions.net) {
      for (const domain of permissions.net) {
        flags.push(`--allow-net=${domain}`);
      }
    }

    // Env, run, etc. similarly

    return flags;
  }
}
```

### MCP Integration: Injecting Tools into Sandbox

The sandbox is isolated from the gateway process. But agent code needs access to MCP tools:

```typescript
// Agent generates code that calls MCP tools:
const config = await readFile("/config.json");    // filesystem MCP
const parsed = await parseJSON(config);           // json MCP
const issue = await createGitHubIssue({...});     // github MCP

// How does isolated code access MCP servers?
```

**Solution: Auto-generated MCP client wrapper**

Before executing agent code, the gateway injects client stubs:

```typescript
// Step 1: Generate MCP client code
const mcpClientCode = `
// Auto-generated MCP tool wrappers
async function readFile(path: string): Promise<string> {
  const response = await fetch("http://localhost:${MCP_PORT}/call", {
    method: "POST",
    body: JSON.stringify({
      tool: "filesystem:read_file",
      arguments: { path }
    })
  });
  return await response.json();
}

async function parseJSON(input: string): Promise<any> {
  const response = await fetch("http://localhost:${MCP_PORT}/call", {
    method: "POST",
    body: JSON.stringify({
      tool: "json:parse",
      arguments: { input }
    })
  });
  return await response.json();
}

// ... one wrapper per relevant tool
`;

// Step 2: Prepend to user code
const fullCode = mcpClientCode + "\n\n" + agentCode;

// Step 3: Execute with network permission to localhost only
await sandbox.execute({
  code: fullCode,
  permissions: {
    net: ["localhost:${MCP_PORT}"]  // Can only talk to gateway
  }
});
```

The gateway runs a local HTTP server that proxies tool calls back to MCP servers.

**Optimization: Semantic tool injection**

Don't inject all 687 tools—that defeats the purpose of sandboxing. Use vector search to identify which tools the code likely needs:

```typescript
async function injectRelevantTools(agentCode: string): string {
  // Semantic analysis: what tools does this code need?
  const codeEmbedding = await embedder.embed(agentCode);

  const relevantTools = await vectorSearch.searchTools(
    codeEmbedding,
    limit = 20,      // At most 20 tools
    threshold = 0.7  // High confidence only
  );

  // Generate wrappers only for relevant tools
  const clientCode = generateMCPClient(relevantTools);

  return clientCode + "\n\n" + agentCode;
}
```

### The PII Detection Layer

Before returning sandbox results to the LLM context, scan for sensitive data:

```typescript
class PIIDetector {
  private patterns = [
    { name: "email", regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
    { name: "ssn", regex: /\b\d{3}-\d{2}-\d{4}\b/g },
    { name: "credit_card", regex: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g },
    { name: "api_key", fn: this.detectAPIKey.bind(this) },
    // ... more patterns
  ];

  scan(text: string): PIIFinding[] {
    const findings: PIIFinding[] = [];

    for (const pattern of this.patterns) {
      if (pattern.regex) {
        const matches = text.matchAll(pattern.regex);
        for (const match of matches) {
          findings.push({
            type: pattern.name,
            value: match[0],
            position: match.index
          });
        }
      } else if (pattern.fn) {
        findings.push(...pattern.fn(text));
      }
    }

    return findings;
  }

  redact(text: string, findings: PIIFinding[]): string {
    let redacted = text;

    // Sort by position (descending) to avoid offset issues
    findings.sort((a, b) => b.position - a.position);

    for (const finding of findings) {
      const replacement = `[REDACTED_${finding.type.toUpperCase()}]`;
      redacted =
        redacted.slice(0, finding.position) +
        replacement +
        redacted.slice(finding.position + finding.value.length);
    }

    return redacted;
  }

  private detectAPIKey(text: string): PIIFinding[] {
    // High-entropy string detection (likely API key)
    const words = text.split(/\s+/);
    const findings: PIIFinding[] = [];

    for (const word of words) {
      if (word.length > 20 && this.calculateEntropy(word) > 4.5) {
        findings.push({
          type: "api_key",
          value: word,
          position: text.indexOf(word)
        });
      }
    }

    return findings;
  }

  private calculateEntropy(str: string): number {
    const freq = new Map<string, number>();
    for (const char of str) {
      freq.set(char, (freq.get(char) || 0) + 1);
    }

    let entropy = 0;
    for (const count of freq.values()) {
      const p = count / str.length;
      entropy -= p * Math.log2(p);
    }

    return entropy;
  }
}

// Usage in sandbox executor:
async function executeSafely(code: string): Promise<string> {
  const result = await sandbox.execute(code);

  const piiDetector = new PIIDetector();
  const findings = piiDetector.scan(result.output);

  if (findings.length > 0) {
    console.warn(`⚠️  Detected ${findings.length} PII instances in sandbox output`);

    // Option 1: Auto-redact
    return piiDetector.redact(result.output, findings);

    // Option 2: Ask user
    const userChoice = await askUser(
      `Found ${findings.length} potential PII instances. Redact automatically?`
    );
    if (userChoice === "yes") {
      return piiDetector.redact(result.output, findings);
    }
  }

  return result.output;
}
```

---

## Combining the Four Concepts

These concepts aren't mutually exclusive—they're complementary layers of optimization that work together.

### Unified Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                   AGENTCARDS UNIFIED ARCHITECTURE                       │
│           Integrating All Four Optimization Concepts                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│                          ┌──────────────┐                              │
│                          │  Claude Code │                              │
│                          └───────┬──────┘                              │
│                                  │                                      │
│                    MCP Protocol (stdio)                                 │
│                                  │                                      │
│                                  ▼                                      │
│         ╔════════════════════════════════════════════════════╗         │
│         ║        AGENTCARDS GATEWAY (Single Entry Point)    ║         │
│         ╠════════════════════════════════════════════════════╣         │
│         ║                                                    ║         │
│         ║  ┌──────────────────────────────────────────────┐ ║         │
│         ║  │ ① SEMANTIC GATEWAY                           │ ║         │
│         ║  │   🔍 Vector Search (PGlite + pgvector)       │ ║         │
│         ║  │   📊 Tool Embeddings (BGE-Large-EN-v1.5)     │ ║         │
│         ║  │                                              │ ║         │
│         ║  │   User: "Read config files"                  │ ║         │
│         ║  │   → Embed query                              │ ║         │
│         ║  │   → Search 687 tool vectors                  │ ║         │
│         ║  │   → Return top 3 relevant tools              │ ║         │
│         ║  │                                              │ ║         │
│         ║  │   Context: 360 tokens vs 60,000 (167x less) │ ║         │
│         ║  └────────────────┬─────────────────────────────┘ ║         │
│         ║                   │                               ║         │
│         ║                   ▼                               ║         │
│         ║  ┌──────────────────────────────────────────────┐ ║         │
│         ║  │ ③ SPECULATIVE EXECUTION                      │ ║         │
│         ║  │   🎯 Intent Analysis & DAG Prediction        │ ║         │
│         ║  │   🧠 Adaptive Threshold Learning             │ ║         │
│         ║  │                                              │ ║         │
│         ║  │   Analyze intent → Predict DAG               │ ║         │
│         ║  │   Confidence > 0.75? → Execute speculatively │ ║         │
│         ║  │   Cache results for instant response         │ ║         │
│         ║  │                                              │ ║         │
│         ║  │   Latency: Agent "thinks" while gateway works│ ║         │
│         ║  │   Result: 5-10x faster user experience       │ ║         │
│         ║  └────────────────┬─────────────────────────────┘ ║         │
│         ║                   │                               ║         │
│         ║                   ▼                               ║         │
│         ║  ┌──────────────────────────────────────────────┐ ║         │
│         ║  │ ② DAG EXECUTION ENGINE (Workflow Orchestrator)│ ║         │
│         ║  │   📊 Topological Sort & Parallel Dispatch    │ ║         │
│         ║  │                                              │ ║         │
│         ║  │   DAG = Graph of Tasks (nodes + edges)       │ ║         │
│         ║  │                                              │ ║         │
│         ║  │   Each task node is EITHER:                  │ ║         │
│         ║  │   • MCP tool call (e.g., filesystem:read)    │ ║         │
│         ║  │   • Sandbox execution ④ (code executor)      │ ║         │
│         ║  │                                              │ ║         │
│         ║  │   Example Mixed DAG:                         │ ║         │
│         ║  │   ┌─────────────────────────────────┐        │ ║         │
│         ║  │   │ Layer 0: [t1: fs:read]          │ (MCP)  │ ║         │
│         ║  │   │          [t2: fs:read]          │ (MCP)  │ ║         │
│         ║  │   ├─────────────────────────────────┤        │ ║         │
│         ║  │   │ Layer 1: [t3: sandbox:execute]  │ (Code) │ ║         │
│         ║  │   │          depends_on: [t1, t2]   │        │ ║         │
│         ║  │   ├─────────────────────────────────┤        │ ║         │
│         ║  │   │ Layer 2: [t4: github:create]    │ (MCP)  │ ║         │
│         ║  │   │          depends_on: [t3]       │        │ ║         │
│         ║  │   └─────────────────────────────────┘        │ ║         │
│         ║  │                                              │ ║         │
│         ║  │   Layers execute in parallel (Promise.all)   │ ║         │
│         ║  │   4-6x speedup for independent tasks         │ ║         │
│         ║  └────────────────┬─────────────────────────────┘ ║         │
│         ║                   │                               ║         │
│         ║                   │ Execute tasks based on type   ║         │
│         ║                   ▼                               ║         │
│         ║        ┌──────────┴──────────┐                    ║         │
│         ║        │                     │                    ║         │
│         ║        ▼                     ▼                    ║         │
│         ║  ┌────────────┐      ┌──────────────────────┐    ║         │
│         ║  │ MCP Tool   │      │ ④ CODE SANDBOX       │    ║         │
│         ║  │ Executor   │      │   (Task Type)        │    ║         │
│         ║  │            │      │                      │    ║         │
│         ║  │ Routes to  │      │ 🔒 Deno Isolation    │    ║         │
│         ║  │ underlying │      │ 🛡️  Permissions      │    ║         │
│         ║  │ MCP server │      │                      │    ║         │
│         ║  │            │      │ Executes agent code  │    ║         │
│         ║  │ fs:read    │      │ with MCP wrappers    │    ║         │
│         ║  │ gh:create  │      │ injected inside      │    ║         │
│         ║  │ db:query   │      │                      │    ║         │
│         ║  │            │      │ Returns summary only │    ║         │
│         ║  │            │      │ (100x context gain)  │    ║         │
│         ║  └────┬───────┘      └──────────┬───────────┘    ║         │
│         ║       │                         │                ║         │
│         ║       └──────────┬──────────────┘                ║         │
│         ║                  │ Both are task executors       ║         │
│         ╚══════════════════╪═══════════════════════════════╝         │
│                              │                                        │
│                   Proxy tool calls to MCP servers                     │
│                              │                                        │
│         ┌────────────────────┼────────────────────┐                  │
│         │                    │                    │                  │
│         ▼                    ▼                    ▼                  │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐         │
│  │Filesystem   │      │  GitHub     │      │  Database   │         │
│  │MCP Server   │      │  MCP Server │      │  MCP Server │         │
│  │(8 tools)    │      │  (12 tools) │      │  (15 tools) │         │
│  └─────────────┘      └─────────────┘      └─────────────┘         │
│                                                                      │
│         ... + 12 more MCP servers (15 total, 687 tools)             │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘

OPTIMIZATION FLOW EXAMPLE:
═══════════════════════════════════════════════════════════════════════

User Request: "Analyze all JSON configs and create GitHub issue summary"

Step 1 - Semantic Gateway:
  Intent: "Analyze all JSON configs and create GitHub issue summary"
  → Vector search identifies 4 relevant tools (from 687 total)
  → Context: 480 tokens vs 60,000 (125x reduction) ✓

Step 2 - Speculative Execution:
  Predicted DAG: list → read_parallel → parse_parallel → summarize
  Confidence: 0.87 (high) → Execute speculatively
  → Executes while agent "thinks"
  → Agent gets instant cached results ✓

Step 3 - Decision: DAG or Sandbox?

  Option A - DAG Execution:
    Layer 0: list_directory          [0.5s]
    Layer 1: read × 15 (parallel)    [1.2s]  ← max of parallel tasks
    Layer 2: parse × 15 (parallel)   [0.3s]
    Layer 3: summarize               [0.2s]
    Total: 2.2s (vs 8.1s sequential)
    Context: All 15 file contents + results = 18,000 tokens

  Option B - Code Sandbox (CHOSEN):
    Execute TypeScript:
      const files = await listDir("/configs");
      const configs = await Promise.all(
        files.map(f => readFile(f).then(JSON.parse))
      );
      return configs.map(c => ({name: c.name, version: c.version}));

    Sandbox execution:  1.8s
    Context: Only summary = 250 tokens (72x less than DAG!)
    PII detection: Scanned, 0 issues

  Winner: Sandbox (faster AND less context) ✓

Step 4 - Final Tool Call:
  create_github_issue({
    title: "Config Analysis",
    body: [summary from sandbox]
  })
  Execution: 0.8s

═══════════════════════════════════════════════════════════════════════
TOTAL PERFORMANCE:

Traditional Sequential:
  15 reads + 15 parses + summarize + create = 8.9s
  Context: 60K (tools) + 18K (data) = 78,000 tokens

AgentCards (All Concepts):
  Speculative + Sandbox + DAG for final call = 2.6s
  Context: 480 (tools) + 250 (summary) = 730 tokens

Result:
  ⚡ Speed: 3.4x faster (8.9s → 2.6s)
  💾 Context: 107x less (78K → 730 tokens)
  🎯 Combined benefit: Both optimizations multiply!
```

```typescript
// User request: "Process all JSON configs in /configs and create a GitHub issue summary"

// IMPORTANT: Le Sandbox est une TASK dans le DAG, pas un système séparé !

// Step 1: Gateway receives intent
const intent = "Process all JSON configs and create summary issue";

// Step 2: Gateway construit le DAG (avec Sandbox comme task)
const workflow: DAGStructure = {
  tasks: [
    // Task 1: MCP tool call (list files)
    {
      id: "t1",
      tool: "filesystem:list_directory",
      arguments: { path: "/configs" },
      depends_on: []
    },

    // Task 2: SANDBOX EXECUTION (process data locally)
    // Le sandbox est juste un type de task dans le DAG !
    {
      id: "t2",
      tool: "agentcards:execute_code",  // Special tool = sandbox
      arguments: {
        code: `
          // Ce code s'exécute dans le sandbox Deno
          // avec des MCP wrappers injectés
          const files = $OUTPUT[t1]; // Récupère résultat de t1

          // Ces fonctions sont auto-injectées dans le sandbox
          const configs = await Promise.all(
            files
              .filter(f => f.endsWith('.json'))
              .map(async f => {
                const content = await readFile(f);  // MCP wrapper injecté
                return JSON.parse(content);
              })
          );

          // Retourne seulement le summary (pas les 1MB de data)
          return configs.map(c => ({
            name: c.name,
            version: c.version,
            env: c.environment
          }));
        `,
        permissions: {
          read: ["/configs"],
          net: ["localhost:9000"]  // Pour appeler le MCP proxy
        }
      },
      depends_on: ["t1"]  // Dépend du listing de fichiers
    },

    // Task 3: MCP tool call (create GitHub issue)
    {
      id: "t3",
      tool: "github:create_issue",
      arguments: {
        title: "Config Summary",
        body: "$OUTPUT[t2]"  // Utilise le summary du sandbox
      },
      depends_on: ["t2"]
    }
  ]
};

// Step 3: DAG Executor exécute les layers
class DAGExecutor {
  async execute(workflow: DAGStructure): Promise<ExecutionResult> {
    // Topological sort → layers
    const layers = [
      ["t1"],           // Layer 0: list_directory (MCP)
      ["t2"],           // Layer 1: sandbox execution (attend t1)
      ["t3"]            // Layer 2: create_issue (attend t2)
    ];

    const results = new Map();

    for (const layer of layers) {
      // Exécute toutes les tasks du layer en parallèle
      await Promise.all(
        layer.map(async (taskId) => {
          const task = workflow.tasks.find(t => t.id === taskId);

          // Route selon le type de task
          if (task.tool === "agentcards:execute_code") {
            // Task = Sandbox execution
            const result = await this.executeSandbox(task);
            results.set(taskId, result);
          } else {
            // Task = MCP tool call
            const result = await this.executeMCPTool(task);
            results.set(taskId, result);
          }
        })
      );
    }

    return { results };
  }

  private async executeSandbox(task: Task): Promise<unknown> {
    // Injecte MCP wrappers dans le code
    const wrappedCode = this.injectMCPWrappers(task.arguments.code);

    // Exécute dans Deno subprocess isolé
    return await this.denoSandbox.execute({
      code: wrappedCode,
      permissions: task.arguments.permissions
    });
  }

  private async executeMCPTool(task: Task): Promise<unknown> {
    // Appelle le serveur MCP directement
    const [serverId, toolName] = task.tool.split(":");
    const client = this.mcpClients.get(serverId);
    return await client.callTool(toolName, task.arguments);
  }
}

// Résultat : Le DAG orchestre TOUT, le sandbox n'est qu'un type de task parmi d'autres !
```

### Safe-to-Fail Branches: Sandbox Tasks Enable Resilient Workflows

One critical architectural advantage: **sandbox tasks can fail without consequences**, enabling more aggressive parallelization and fault-tolerant workflows.

**The Problem with Destructive MCP Tasks:**

```typescript
// ❌ DANGEROUS: Parallel MCP tasks with side effects
const riskyWorkflow = {
  tasks: [
    { id: "t1", tool: "database:delete_records", ... },  // Irreversible
    { id: "t2", tool: "github:create_issue", ... },      // Can't undo
    { id: "t3", tool: "slack:send_message", ... }        // Already sent
  ]
};

// If any task fails after others succeed → Inconsistent state!
// Can't safely retry without duplicate actions
```

**The Solution: Sandbox-First for Risky Logic**

```typescript
// ✅ RESILIENT: Parallel sandbox branches (safe to fail)
const resilientWorkflow = {
  tasks: [
    // Read data once (MCP)
    { id: "read", tool: "filesystem:read_file", ... },

    // Try 3 parallel analysis approaches in sandbox
    // Any/all can fail without consequences!
    {
      id: "analysis_fast",
      tool: "agentcards:execute_code",
      arguments: {
        code: `
          // Quick heuristic (might fail on edge cases)
          return fastHeuristicAnalysis($OUTPUT[read]);
        `,
        timeout: 500
      },
      depends_on: ["read"]
    },
    {
      id: "analysis_ml",
      tool: "agentcards:execute_code",
      arguments: {
        code: `
          // ML model (might timeout)
          return mlModelPredict($OUTPUT[read]);
        `,
        timeout: 2000
      },
      depends_on: ["read"]
    },
    {
      id: "analysis_stats",
      tool: "agentcards:execute_code",
      arguments: {
        code: `
          // Statistical (might fail on outliers)
          return statisticalAnalysis($OUTPUT[read]);
        `
      },
      depends_on: ["read"]
    },

    // Aggregate: Use whichever succeeded
    {
      id: "aggregate",
      tool: "agentcards:execute_code",
      arguments: {
        code: `
          const results = [];
          if ($OUTPUT[analysis_fast]) results.push($OUTPUT[analysis_fast]);
          if ($OUTPUT[analysis_ml]) results.push($OUTPUT[analysis_ml]);
          if ($OUTPUT[analysis_stats]) results.push($OUTPUT[analysis_stats]);

          // Return best result (by confidence)
          return results.sort((a, b) => b.confidence - a.confidence)[0];
        `
      },
      depends_on: ["analysis_fast", "analysis_ml", "analysis_stats"]
    },

    // Only commit to external system after sandbox processing
    { id: "save", tool: "database:insert", arguments: { data: "$OUTPUT[aggregate]" } }
  ]
};

// Execution result:
// Layer 1: analysis_fast ✓ | analysis_ml ✗ (timeout) | analysis_stats ✓
//          → 2 out of 3 succeeded, workflow continues!
// Layer 2: aggregate picks best result
// Layer 3: save commits final result

// 🎯 Graceful degradation: Workflow succeeds even with partial failures
```

**Architectural Benefits:**

1. **Retry Without Risk**
   ```typescript
   // Sandbox tasks are idempotent → safe to retry
   for (let attempt = 0; attempt < 3; attempt++) {
     try {
       return await executeSandbox(task);
     } catch (error) {
       // Retry without side effects!
       if (attempt < 2) continue;
       throw error;
     }
   }

   // MCP tasks might NOT be idempotent → dangerous to retry
   await executeMCPTool(task);  // What if this creates duplicate resources?
   ```

2. **Failure Isolation**
   | Task Type | Failure Impact | Retry Safe | Can Run Speculatively |
   |-----------|---------------|------------|----------------------|
   | MCP (destructive) | ❌ System state changed | ❌ Risky | ❌ No |
   | MCP (read-only) | ✅ No impact | ✅ Safe | ✅ Yes |
   | **Sandbox** | ✅ No impact | ✅ Safe | ✅ Yes |

3. **A/B Testing in Production**
   ```typescript
   // Run 2 algorithms concurrently, compare results
   {
     tasks: [
       { id: "algo_v1", tool: "agentcards:execute_code", ... },
       { id: "algo_v2", tool: "agentcards:execute_code", ... },
       {
         id: "choose_best",
         code: `
           const v1 = $OUTPUT[algo_v1];
           const v2 = $OUTPUT[algo_v2];
           return v1.accuracy > v2.accuracy ? v1 : v2;
         `
       }
     ]
   };
   // Can safely experiment without affecting system state
   ```

This pattern transforms the DAG from a rigid execution plan into a **resilient computation graph** where branches can fail independently without cascading failures.

```typescript
// Step 2: Semantic search identifies relevant tools
const tools = await gateway.searchTools(intent);
// Returns: [filesystem:list, filesystem:read, json:parse, github:create_issue]

// Step 3: Agent decides execution strategy
// The agent (or gateway) must choose:
// - Sequential tool calls? (baseline)
// - DAG workflow? (parallel tool calls)
// - Sandbox execution? (local code)

// Let's compare all three approaches:

// === OPTION A: Sequential Tool Calls (baseline) ===
async function optionA_sequential() {
  const files = await callTool("filesystem:list_directory", { path: "/configs" });
  // Context: 2,400 tokens (50 files × 48 tokens each)

  const contents = [];
  for (const file of files) {
    if (file.endsWith(".json")) {
      const content = await callTool("filesystem:read_file", { path: file });
      contents.push(content);
    }
  }
  // Context: 2,400 + 120,000 tokens (15 JSON files × 8,000 tokens each)

  const parsed = [];
  for (const content of contents) {
    const data = await callTool("json:parse", { input: content });
    parsed.push(data);
  }
  // Context: 122,400 + 60,000 tokens (parsed objects)

  const summary = JSON.stringify(parsed);
  await callTool("github:create_issue", {
    title: "Config Summary",
    body: summary
  });

  // Total context: 182,400 tokens
  // Total time: 1.2s + (15 × 1.1s) + (15 × 0.2s) + 0.8s = 21.7s
}

// === OPTION B: DAG Workflow (parallel tool calls) ===
async function optionB_dag() {
  const workflow = {
    tasks: [
      // Layer 0: List files
      { id: "list", tool: "filesystem:list_directory", args: { path: "/configs" } },

      // Layer 1: Read all JSON files in parallel (auto-detected from list result)
      ...generatedReadTasks,  // 15 tasks, all depend on "list"

      // Layer 2: Parse all in parallel
      ...generatedParseTasks,  // 15 tasks, each depends on corresponding read

      // Layer 3: Aggregate and create issue
      { id: "create", tool: "github:create_issue", args: {
        body: "$OUTPUT[parse1], $OUTPUT[parse2], ..."
      }}
    ]
  };

  await dagExecutor.execute(workflow);

  // Total context: 182,400 tokens (same as sequential)
  // Total time: 1.2s + max(1.1s × 15 parallel) + max(0.2s × 15 parallel) + 0.8s
  //           = 1.2s + 1.1s + 0.2s + 0.8s = 3.3s
  // Speedup: 6.6x faster, but same context usage
}

// === OPTION C: Sandbox Execution (local code) ===
async function optionC_sandbox() {
  const agentCode = `
    // List files
    const allFiles = await listDirectory("/configs");
    const jsonFiles = allFiles.filter(f => f.endsWith(".json"));

    // Read and parse in parallel (native Promise.all)
    const configs = await Promise.all(
      jsonFiles.map(async file => {
        const content = await readFile(file);
        return JSON.parse(content);
      })
    );

    // Extract only key information (not full configs)
    const summary = configs.map(c => ({
      name: c.name,
      version: c.version,
      env: c.environment
    }));

    // Create GitHub issue with summary (not full data)
    await createGitHubIssue({
      title: "Config Summary - " + new Date().toISOString(),
      body: "Found " + configs.length + " configs:\\n\\n" +
            JSON.stringify(summary, null, 2)
    });

    return { processed: configs.length, summary };
  `;

  const result = await sandbox.execute({
    code: agentCode,
    permissions: {
      read: ["/configs"],
      net: ["localhost:${MCP_PORT}"]  // For MCP tool calls
    },
    timeout: 10000
  });

  // Total context: ~1,200 tokens (just the code + small result)
  // Total time: 1.2s (dominated by I/O, parallelized internally)
  // Improvement: 152x less context, 18x faster
}
```

### Decision Matrix: Which Approach When?

| Scenario | Best Approach | Rationale |
|----------|---------------|-----------|
| 15+ MCP servers configured | **Gateway** | Context optimization (15x reduction) |
| 5+ independent I/O tasks | **DAG Execution** | Latency reduction (4-6x speedup) |
| Large dataset processing (>10K tokens intermediate data) | **Sandbox** | Context + compute efficiency (100x+ reduction) |
| Simple 1-3 tool workflow | Standard MCP | No overhead needed |
| External API-heavy workflow | **DAG > Sandbox** | APIs often can't run in sandbox |
| Sensitive data processing | **Sandbox** | Local processing, return only aggregates |
| Cross-server workflows (5+ servers) | **Gateway + DAG** | Tool discovery + parallelization |
| Iterative data processing | **Sandbox** | Loops/recursion difficult in DAG |

### Performance Characteristics: Combined Optimizations

Real benchmark from AgentCards:

```
Scenario: Process 50 JSON config files (total 2.1MB)
         Extract version numbers
         Create GitHub issue with summary

┌─────────────────────┬──────────────┬─────────────┬──────────┐
│ Approach            │ Context Used │ Total Time  │ Success  │
├─────────────────────┼──────────────┼─────────────┼──────────┤
│ Sequential MCP      │ 187K tokens  │ 42.3s       │ ❌ Failed│
│ (baseline)          │ (>100% limit)│             │ (context)│
├─────────────────────┼──────────────┼─────────────┼──────────┤
│ Gateway only        │ 4.2K tokens  │ 42.3s       │ ✅ Works │
│ (semantic search)   │              │             │ (slow)   │
├─────────────────────┼──────────────┼─────────────┼──────────┤
│ Gateway + DAG       │ 4.2K tokens  │ 8.7s        │ ✅ Works │
│ (parallel reads)    │              │             │          │
├─────────────────────┼──────────────┼─────────────┼──────────┤
│ Gateway + Sandbox   │ 1.8K tokens  │ 2.1s        │ ✅ Works │
│ (local processing)  │              │             │ (optimal)│
└─────────────────────┴──────────────┴─────────────┴──────────┘

Improvement over baseline:
- Context: 104x reduction (187K → 1.8K)
- Speed: 20x faster (42.3s → 2.1s)
```

The key insight: **these optimizations stack multiplicatively, not additively.**

---

## Implications for the MCP Ecosystem

### Is This a New Protocol Layer?

The gateway pattern is **middleware**, not a protocol replacement:

- ✅ Sits between LLMs and MCP servers (like nginx between clients and backends)
- ✅ Compatible with any existing MCP server (zero code changes required)
- ✅ Provides optimization without changing the MCP protocol
- ✅ Can be adopted incrementally (start with 1 server, add more)

**Analogy: HTTP Proxies**

Just as nginx provides caching, load balancing, and SSL termination without changing HTTP, MCP gateways provide context optimization, orchestration, and sandboxing without changing MCP.

The protocol remains simple. Complexity lives in one place (the gateway). Servers stay stateless and focused.

### Should These Concepts Be in the MCP Spec?

This raises interesting questions about where functionality belongs:

**Semantic queries (`tools/list` with query param):**
- ✅ Could be optional MCP protocol extension
- ✅ Backward compatible (query is optional)
- ⚠️ Requires every server to implement semantic search (complexity shift)
- ⚠️ Or servers that don't support it return all tools anyway (fragmentation)

**DAG execution (workflow-as-a-service):**
- ✅ Could be a new MCP capability: `workflows`
- ✅ Servers could expose `execute_workflow` tool
- ⚠️ Significant complexity for server implementers
- ⚠️ Not all servers need orchestration capability

**Code sandboxing:**
- ✅ Could be an MCP server type: `execution-server`
- ✅ Servers expose `execute_code` tool with language/runtime spec
- ⚠️ Security model varies widely (Deno, WASM, containers, VMs)
- ⚠️ Difficult to standardize permissions model

**Our stance:**

> "These concepts should remain in the application layer (gateways, frameworks) for now. If they prove valuable across multiple implementations, future MCP versions could standardize interfaces. But premature standardization would stifle innovation."

The MCP protocol is young. Let a thousand flowers bloom. Standardize the patterns that prove universally useful.

### Open Questions for the Community

1. **Gateway discovery:** How should MCP clients know a gateway exists vs. direct servers?
   - Capability flag in MCP handshake?
   - Convention-based (server named "gateway")?
   - User configuration only?

2. **Caching semantics:** Should MCP have HTTP-style cache-control headers?
   - `Cache-Control: max-age=3600` for tool schemas
   - `ETag` for tool result validation
   - Invalidation webhooks

3. **Streaming partial results:** Can DAG execution stream results as layers complete?
   - Current MCP: Single response when tool finishes
   - Proposed: SSE stream with incremental updates
   - Use case: Show progress for long-running workflows

4. **Security boundaries:** Who's responsible for sandboxing?
   - Gateway (our approach): Centralized security policy
   - Server: Each server sandboxes its own operations
   - Client: LLM runtime provides sandbox (e.g., Claude's computer use)

5. **Error handling in DAGs:** What happens when a task fails mid-workflow?
   - Fail fast (stop entire workflow)?
   - Continue independent branches (partial success)?
   - Retry with exponential backoff?

6. **Observability:** How to debug complex gateway behaviors?
   - Standard logging format for MCP gateways?
   - Trace IDs across multi-server calls?
   - Performance monitoring APIs?

We don't have all the answers. These are areas for community experimentation and eventual standardization.

---

## Speculative Execution Meets Safe-to-Fail Branches: The Perfect Marriage

The combination of **Speculative Execution** (Concept 3) and **Safe-to-Fail Branches** (Concept 4) creates something greater than the sum of its parts. Here's why they're particularly powerful together:

### The Risk Problem with Speculative Execution

Traditional speculative execution on MCP tools is **risky**:

```typescript
// ❌ DANGEROUS: Speculative execution with side effects

User intent: "Check version and create GitHub issue if outdated"
Gateway predicts (confidence: 0.78):
  1. check_version
  2. create_github_issue ← ⚠️ HAS SIDE EFFECTS!

Gateway speculatively executes both...
→ Creates GitHub issue EVEN IF version is current
→ Prediction was wrong, but damage is done
→ Can't rollback (GitHub issue already created)

Result: False positive creates unwanted side effects
```

This forces conservative thresholds on speculative execution, limiting its benefits.

### Safe-to-Fail Branches Unlock Aggressive Speculation

Sandbox tasks are **idempotent and isolated**—they can fail or be discarded without consequences:

```typescript
// ✅ SAFE: Speculative execution with sandbox branches

User intent: "Analyze commits and summarize trends"
Gateway predicts (confidence: 0.78):
  1. fetch_commits (MCP call)
  2. analyze_fast (sandbox) ← Safe to speculate
  3. analyze_ml (sandbox) ← Safe to speculate
  4. analyze_stats (sandbox) ← Safe to speculate

Gateway speculatively executes ALL approaches in parallel:
→ If predictions wrong: Discard results (no side effects)
→ If predictions right: Agent gets instant multi-perspective analysis
→ Partial success: Keep what worked, ignore failures

Result: Aggressive speculation with zero risk
```

### The Three Key Synergies

**1. Intelligent Environment Isolation**

The gateway executes **heavy operations in a separate environment** invisible to the agent:

```
WITHOUT Sandbox (context pollution):
──────────────────────────────────────
Agent: "Analyze 1000 commits"
Gateway → Returns 1000 commits (1.2MB JSON)
Agent context → Saturated (60% of window)
Agent → Must parse and analyze manually
Result: Slow + Context hungry


WITH Sandbox (intelligent delegation):
──────────────────────────────────────
Agent: "Analyze 1000 commits"
Gateway → Executes in sandbox:
           • Fetches 1000 commits (invisible to agent)
           • Parses & filters locally
           • Extracts key insights
Gateway → Returns summary (2KB)
Agent context → Minimal ("15 commits by Alice, 3 breaking changes")
Result: Fast + Context efficient
```

The agent **never sees the raw data**—only the processed insights. This is the true intelligence of the gateway: delegate computation to isolated environments, return only what matters.

**2. Multi-Hypothesis Execution Without Risk**

Sandbox enables **parallel speculative branches**:

```typescript
// Execute 3 analysis approaches simultaneously
const resilientWorkflow = {
  tasks: [
    { id: "fetch", tool: "github:list_commits" },

    // Launch 3 parallel sandbox branches (all safe to fail!)
    {
      id: "fast",
      tool: "agentcards:execute_code",
      code: "simpleAnalysis(commits)",
      timeout: 500,  // Fast but basic
      depends_on: ["fetch"]
    },
    {
      id: "ml",
      tool: "agentcards:execute_code",
      code: "mlAnalysis(commits)",
      timeout: 2000,  // Slow but sophisticated
      depends_on: ["fetch"]
    },
    {
      id: "stats",
      tool: "agentcards:execute_code",
      code: "statisticalAnalysis(commits)",
      depends_on: ["fetch"]
    },

    // Aggregator uses whatever succeeded
    {
      id: "aggregate",
      tool: "agentcards:execute_code",
      code: `
        const results = [];
        if ($OUTPUT.fast) results.push($OUTPUT.fast);
        if ($OUTPUT.ml) results.push($OUTPUT.ml);
        if ($OUTPUT.stats) results.push($OUTPUT.stats);
        return mergeBestInsights(results);
      `,
      depends_on: ["fast", "ml", "stats"]
    }
  ]
};
```

**Traditional MCP tools:** Can't do this—each has side effects, retries cause duplicates
**Sandbox branches:** Perfect for this—failures are free, successes are valuable

**3. Graceful Degradation Under Time Pressure**

```typescript
// Speculative execution with built-in fallbacks

Scenario: "Quick analysis needed, but comprehensive if time allows"

Gateway speculatively executes:
  t=0ms:  Launch fast analysis (timeout: 300ms)
  t=0ms:  Launch ML analysis (timeout: 2000ms)
  t=0ms:  Launch comprehensive analysis (no timeout)

Outcomes:
  • All succeed → Return comprehensive results
  • ML times out → Use fast + comprehensive (partial win)
  • Only fast succeeds → Return basic analysis (degraded but functional)

Agent gets: Best available results within time constraints
No rollback needed: Failed branches just ignored
```

### The Speculative Resilience System

Combining these concepts creates **speculative resilience**: the gateway can aggressively predict and execute multiple hypotheses, knowing failures are safe and successes are valuable.

```
Traditional Sequential:        Speculative + Safe-to-Fail:
─────────────────────         ────────────────────────────
Agent thinks (1s)              Agent thinks (1s)
  ↓                              ↓ (parallel)
Gateway waits                  Gateway predicts & executes:
  ↓                              • Approach A (sandbox)
Agent requests                   • Approach B (sandbox)
  ↓                              • Approach C (sandbox)
Gateway executes (2s)            ↓
  ↓                            Results ready (1.5s)
Agent waits                      ↓
  ↓                            Agent requests
Results (3s total)               ↓
                               Instant response (1s total)

                               If any fail: No consequences
                               If all succeed: Choose best
```

### Key Insight

**Speculative Execution** answers: "When should we predict and execute early?"
**Safe-to-Fail Branches** answers: "How can we make aggressive speculation risk-free?"

Together, they transform the gateway from a passive proxy into an **intelligent execution system** that:
- Works ahead of the agent (speculative)
- Tries multiple approaches (resilient)
- Operates in isolated environments (safe)
- Returns only essential results (context-efficient)
- Degrades gracefully under failure (robust)

This is the architectural vision of AgentCards: a gateway that doesn't just route requests, but **intelligently orchestrates computation** on behalf of constrained AI agents.

---

## Prior Art and Inspirations

These architectural concepts didn't emerge in a vacuum. AgentCards builds on pioneering work from the AI agent and MCP communities:

### LLMCompiler: Parallel Function Calling

The DAG-based parallel execution concept draws heavily from **LLMCompiler** ([SqueezeAILab/LLMCompiler](https://github.com/SqueezeAILab/LLMCompiler), [crazyyanchao/llmcompiler](https://github.com/crazyyanchao/llmcompiler)).

LLMCompiler introduced the idea of treating agent workflows as computation graphs:

> "An LLM Compiler for Parallel Function Calling" demonstrates that LLMs can generate execution plans (DAGs) where independent function calls execute in parallel, dramatically reducing end-to-end latency.

**Key insights we adopted:**

1. **Task graph representation:** Workflows as nodes (tools) and edges (dependencies)
2. **Parallel dispatcher:** Topological sort → layer-by-layer execution
3. **Output streaming:** Progressive results as tasks complete
4. **Planner-executor split:** LLM plans, executor orchestrates

**Where we diverged:**

- **MCP-native:** LLMCompiler uses custom function definitions; we work with MCP protocol directly
- **Semantic discovery:** We added vector search for tool discovery (not in LLMCompiler)
- **Speculative execution:** We predict DAGs from intent; LLMCompiler requires explicit planning
- **Gateway pattern:** We operate as middleware; LLMCompiler is client-side

The LLMCompiler paper validated that parallel execution is practical and achieves 3-10x speedups in real workflows—this gave us confidence to build it into AgentCards.

### AIRIS: MCP Gateway Pioneer

**AIRIS** was one of the first MCP gateways to attempt context optimization and multi-server consolidation.

**What AIRIS got right:**

- Gateway-as-consolidation layer (single entry point for multiple servers)
- Recognition that context saturation is the bottleneck at scale
- Lazy loading concept (though implementation was incomplete)

**What we learned from AIRIS's challenges:**

- ❌ **Docker complexity:** Container-based deployment created filesystem access issues
- ❌ **Incomplete lazy loading:** Promised on-demand tool loading but shipped all-at-once
- ❌ **No orchestration:** Workflows still executed sequentially
- ❌ **Reliability issues:** Crashes and connection problems limited adoption

AgentCards learned from these pitfalls:

- ✅ **Local-first:** No containers, runs directly via Deno (zero Docker hassles)
- ✅ **Real lazy loading:** Vector search ensures genuinely on-demand tool discovery
- ✅ **DAG orchestration:** Parallel execution core to design, not afterthought
- ✅ **Production hardening:** Health checks, error handling, observability from day one

AIRIS showed the market wanted MCP gateways. AgentCards aims to deliver what AIRIS promised.

### Anthropic's Code Execution Article

Anthropic's ["Improving Agent Tool Use with Code Execution"](https://www.anthropic.com/engineering/code-execution-with-mcp) article directly inspired the **Agent Code Sandboxing** concept.

**Core thesis from the article:**

> "Instead of defining hundreds of tool schemas, give the agent a single `execute_code` tool. Let it write code to process data locally, then return only the summary to the context."

**Key benefits they identified:**

1. **Context reduction:** 98.7% fewer tokens (2-hour meeting transcript: 50K tokens → 650 tokens)
2. **Privacy preservation:** Sensitive data processed locally, never enters LLM context
3. **Flexibility:** Code can handle arbitrary data transformations without pre-defined tools
4. **State management:** Loops, variables, complex logic—all native to code

**How AgentCards extends this:**

- **MCP tool injection:** Sandbox can still call MCP tools (best of both worlds)
- **Vector-guided imports:** Semantic search identifies which tools to inject into code context
- **PII detection layer:** Automatic scanning before results return to LLM
- **Deno security model:** Capability-based permissions vs. generic sandboxing

Anthropic validated that code execution solves real problems. AgentCards makes it work seamlessly with the MCP ecosystem.

### Synthesis: Standing on the Shoulders of Giants

AgentCards doesn't claim novelty in individual techniques:

- **Parallel execution:** LLMCompiler pioneered this
- **Gateway pattern:** AIRIS explored it (with mixed results)
- **Code sandboxing:** Anthropic demonstrated its value

**Our contribution is synthesis:**

Combining semantic gateways + DAG execution + speculative prediction + code sandboxing into a **unified MCP optimization layer** that works with any existing MCP server.

It's the integration that creates value—each concept amplifies the others.

---

## Conclusion

The Model Context Protocol enables composability. Hundreds of MCP servers can now connect AI agents to the world.

But composability without optimization leads to context saturation, sequential bottlenecks, and intermediate data bloat. At 15+ MCP servers, the direct-connection model breaks down.

We've explored four architectural concepts to address these limitations:

1. **Semantic Gateway Pattern** — Vector search for dynamic tool discovery, reducing context from 30-50% to <5% (15x improvement)

2. **DAG-Based Parallel Execution** — Dependency graphs enable parallel tool calls, reducing workflow latency by 4-6x

3. **Speculative Execution** — Intent-based workflow prediction with adaptive learning, eliminating agent "thinking time" for 5-10x faster user experience

4. **Agent Code Sandboxing** — Local computation in secure sandbox, reducing context by 100x+ for data-heavy workloads while preserving privacy

These aren't protocol changes—they're optimization layers compatible with any MCP server.

### The Vision

Imagine a future where:
- A single MCP configuration contains 50+ servers without context saturation
- Multi-tool workflows execute in sub-second latency via intelligent parallelization and prediction
- Results appear instantly when agents predict correctly (90%+ accuracy with historical learning)
- Agents process gigabyte-scale datasets locally, returning only insights to the context
- All of this works with existing MCP servers, no code changes required

That's what these concepts enable.

### Try It Yourself

AgentCards implements all four concepts:

```bash
# Install
git clone https://github.com/YOUR_USERNAME/agentcards
cd agentcards

# Initialize (migrates Claude Desktop config, generates embeddings)
./agentcards init

# Start gateway
./agentcards serve
```

Then update Claude Desktop to use AgentCards as a single MCP server. Your existing 15 servers continue working—but with 15x less context, 5x faster workflows, and local data processing.

### We'd Love Your Feedback

These are early-stage ideas. We're experimenting, measuring, and iterating.

**We're particularly interested in:**
- Real-world workflow benchmarks (Does DAG execution help your use cases?)
- Security model feedback (Is the Deno sandbox approach sound?)
- Alternative semantic search techniques (Better than vector embeddings?)
- Protocol extension proposals (Should any of this be in MCP spec?)

Join the discussion:
- **GitHub:** [github.com/YOUR_USERNAME/agentcards](https://github.com/YOUR_USERNAME/agentcards)
- **Issues:** [Report bugs, request features](https://github.com/YOUR_USERNAME/agentcards/issues)
- **Discussions:** [Share your workflow optimizations](https://github.com/YOUR_USERNAME/agentcards/discussions)

The MCP ecosystem is just getting started. Let's build the optimization layer that makes large-scale agent workflows practical.

---

**Resources:**

- [AgentCards Documentation](../README.md)
- [Architecture Decisions](./architecture.md)
- [Product Requirements](./PRD.md)
- [MCP Protocol Specification](https://spec.modelcontextprotocol.io/)
- [Anthropic's MCP Resources](https://github.com/modelcontextprotocol)

**Inspirations & Related Work:**

- [LLMCompiler (SqueezeAILab)](https://github.com/SqueezeAILab/LLMCompiler) - Parallel function calling with DAG execution
- [LLMCompiler (crazyyanchao)](https://github.com/crazyyanchao/llmcompiler) - Alternative implementation
- [Anthropic: Code Execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp) - Agent code sandboxing concepts
- [AIRIS Gateway](https://github.com/airis-ai/airis) - Early MCP gateway exploration

---

*This article describes concepts implemented in AgentCards, an open-source MCP gateway. All code examples are illustrative; see the actual implementation for production details.*
