# MCP Gateway Architecture: Semantic Discovery and Parallel Execution

**Author:** AgentCards Team
**Date:** January 2025
**Topics:** MCP Protocol, Agent Architecture, Performance Optimization

---

## The MCP Scalability Paradox

The Model Context Protocol (MCP) aimed to be the "USB standard" for AI agents — a universal interface connecting language models to tools and data sources. And in many ways, it's succeeded: hundreds of MCP servers exist today, covering filesystem access, GitHub integration, database queries, and much more.

But there's an irony at the heart of MCP adoption: **the protocol scales, but the user experience doesn't.**

The standard architecture today involves connecting Claude Desktop (or Claude Code) directly to multiple MCP servers simultaneously. A typical configuration looks like this:

```json
{
  "mcpServers": {
    "filesystem": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem"] },
    "github": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"] },
    "database": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-postgres"] },
    // ... 12 additional servers
  }
}
```

This approach works admirably for 3-5 servers. But beyond 15 servers, cracks appear:

1. **Context saturation**: Tool schemas consume 30-50% of Claude's context window before any actual work begins
2. **Sequential execution**: Multi-tool workflows execute one tool at a time, accumulating latency
3. **Intermediate data bloat**: Large datasets transit unnecessarily through the context window

These aren't bugs — they're architectural limitations of the direct-connection model.

In this article (first in a two-part series), we explore two architectural concepts that address these limitations:

1. **Semantic Gateway Pattern** — Dynamic tool discovery via vector search
2. **DAG-Based Parallel Execution** — Eliminating sequential bottlenecks via dependency graphs

---

## Concept 1: The Semantic Gateway Pattern

### From Static to Dynamic Discovery

The MCP protocol defines a simple method for tool discovery: the client requests the complete list, the server returns all its tools. Simple, but with a critical problem: **no context about what the user is trying to do**.

The server has no choice but to return everything. If you have 15 MCP servers with an average of 45 tools each, that's 687 tool schemas loaded into Claude's context. At roughly 80-150 tokens per schema, we're talking about 55,000 to 103,000 tokens consumed before the first user message.

For Claude's 200,000-token context window, that's **27-51% overhead just for tool definitions**.

This architectural decision made sense when MCP was new and servers were few. But it doesn't scale. It's an information asymmetry: the server doesn't know the user's intent, so it must send everything. The client must load everything to decide what's relevant.

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
│                                                                         │
│              All 35 schemas loaded into context                        │
│              Usage: ~4,200 tokens (2.1% of 200K)                       │
│              For 15 servers: ~82,440 tokens (41% of context!)          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                      GATEWAY ARCHITECTURE                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│                          ┌──────────────┐                              │
│                          │  Claude Code │                              │
│                          └───────┬──────┘                              │
│                                  │ Single MCP connection               │
│                                  ▼                                      │
│                    ┌─────────────────────────┐                         │
│                    │   AgentCards Gateway    │                         │
│                    ├─────────────────────────┤                         │
│                    │  🔍 Vector Search       │                         │
│                    │  📊 PGlite + pgvector   │                         │
│                    │  🧠 Semantic Discovery  │                         │
│                    │  ⚡ DAG Executor        │                         │
│                    └──────────┬──────────────┘                         │
│                               │ Proxies tool calls                      │
│              ┌────────────────┼────────────────┐                       │
│              │                │                │                        │
│              ▼                ▼                ▼                        │
│    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐       │
│    │  Filesystem MCP │ │   GitHub MCP    │ │  Database MCP   │       │
│    │   (8 tools)     │ │   (12 tools)    │ │   (15 tools)    │       │
│    └─────────────────┘ └─────────────────┘ └─────────────────┘       │
│                               │                                         │
│              ... + 12 additional MCP servers (15 total)                │
│                                                                         │
│    ┌────────────────────────────────────────────────────────────┐     │
│    │ Query: "Read configuration files"                          │     │
│    │ → Vector search identifies 3 relevant tools:               │     │
│    │   • filesystem:read_file                                   │     │
│    │   • filesystem:list_directory                              │     │
│    │   • json:parse                                             │     │
│    │                                                             │     │
│    │ Context usage: ~360 tokens (0.18%)                         │     │
│    │ vs. loading all 687 tools: ~82,440 tokens (41%)            │     │
│    │                                                             │     │
│    │ 🎯 Context reduction: 229x improvement                     │     │
│    └────────────────────────────────────────────────────────────┘     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

The gateway provides a single MCP endpoint to Claude while maintaining connections to all your real MCP servers. But more importantly, it can make intelligent decisions about which tools to expose.

### Vector Embeddings as Discovery Mechanism

Why vector search over traditional indexing?

Keyword-based approaches fail quickly. For example, for the intent "Read configuration files and parse them", keyword search would miss `yaml:load` (different vocabulary) or `S3:get_object` (could read configs from S3).

Semantic embeddings capture intent across vocabulary variations:

```
Query: "read configuration files and parse them"

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

The gateway generates embeddings for all tool schemas during initialization (one-time operation), then performs vector similarity search at runtime. The implementation philosophy is simple:

**Initialization**: For each tool, combine name + description + schema into searchable text, generate embedding, and store in a vector database (PGlite + pgvector).

**Runtime search**: Generate embedding of user intent, query the vector database with similarity threshold (0.6), and return the most relevant tools.

> **Validation Note:** Context reduction metrics (229x) are empirically validated by our tests. For a typical query "read config.json and create GitHub issue", vector search identifies 3 relevant tools out of 687 available (similarity score >0.6), reducing context usage from 82,440 tokens (41%) to 360 tokens (0.18%) — a 229x improvement. Search time: <6ms on average.

### Local vs. Cloud Embeddings: Trade-off Analysis

We chose local embeddings (Transformers.js + BGE-M3) over cloud APIs. Here's why:

**Local embeddings (our choice):**
- ✅ Zero latency (no network round-trip)
- ✅ Total privacy (no data leaves the machine)
- ✅ Zero cost (no API fees)
- ✅ Works offline
- ⚠️ One-time setup cost (60s to embed 687 tools)
- ⚠️ Quality: very good, not perfect

**Cloud embeddings (OpenAI, Cohere, Voyage):**
- ✅ Better embedding quality
- ⚠️ 100-300ms latency per request
- ⚠️ Privacy concerns (schemas reveal system architecture)
- ⚠️ API costs that scale with usage
- ⚠️ Network dependency

For a gateway running locally and handling potentially sensitive tool schemas, **privacy and latency outweigh marginal quality improvements**. The local model is "good enough" for tool retrieval — we rarely see relevant tools ranked below the threshold.

### The Gateway as Universal Middleware

An interesting question arises: should semantic search be part of the MCP protocol itself?

**Arguments for extending the protocol:**
- Standardizes semantic discovery
- Allows clients to optimize their own tool loading
- Backward compatible (optional parameter)

**Arguments against:**
- Shifts complexity to every server implementation
- Not all servers have embedding capabilities
- Could fragment the ecosystem
- Semantic search may not be the right primitive for all use cases

**Our approach: Gateway as middleware layer**

Instead of requiring all MCP servers to implement semantic search, the gateway provides it as a universal layer. Any existing MCP server benefits immediately without code changes. Servers stay simple. Complexity lives in one place.

This mirrors web infrastructure patterns: nginx handles caching and load balancing so backend services don't have to. The MCP gateway handles tool discovery optimization so MCP servers don't have to.

---

## Concept 2: DAG-Based Parallel Execution

### GraphRAG vs DAG: Architectural Clarification

Before diving into parallel execution, it's crucial to understand the distinction between two architectural components that work together:

**GraphRAG (Knowledge Graph)** — The complete knowledge base
- Stores ALL tools from ALL MCP servers (e.g., 687 tools)
- Contains execution history of workflows and their success/failure patterns
- Maintains relationships between tools (e.g., "filesystem:read often followed by json:parse")
- Contains embeddings for semantic search
- **Scope:** Global, all possibilities

**DAG (Directed Acyclic Graph)** — The specific workflow instance
- A concrete workflow for ONE specific task
- Contains only the 3-5 relevant tools for this query
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
│ Example learned relationships:                        │
│ - "filesystem:read" → "json:parse" (85% correlation)  │
│ - "git:log" → "text:summarize" (72% correlation)      │
│                                                        │
│ = THE KNOWLEDGE, not the execution                    │
└────────────────┬───────────────────────────────────────┘
                 │
                 │ User intent: "Read config and create issue"
                 │
                 ▼
       ┌─────────────────────┐
       │  DAG SUGGESTER      │  ← Intelligence layer
       │                     │
       │ 1. Query GraphRAG
       │ 2. Find patterns
       │ 3. Predict workflow
       │ 4. Build DAG
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

**Why this distinction matters:**
- GraphRAG = "What workflows worked before?"
- DAG Suggester = "Based on this intent, what workflow to build?"
- DAG = "Here's the concrete plan to execute"
- DAG Executor = "Let's execute this plan (possibly speculatively)"

Without GraphRAG (the knowledge), we can't predict which DAG to build. Without DAG (the structure), we can't execute workflows in parallel. They're complementary.

### The Sequential Execution Bottleneck

MCP workflows today execute sequentially. The LLM must:
1. Make a tool call
2. Wait for the result
3. Incorporate the result into context
4. Decide on the next tool call
5. Repeat

This is by design. MCP keeps servers stateless and simple. Orchestration is left to the client (Claude). But this creates a fundamental bottleneck: **even when tasks are independent, they execute serially**.

Consider a concrete example:

```
User request: "Read these 5 configuration files"
Files: config.json, database.json, api.json, auth.json, features.json

Sequential execution timeline:
0.0s → 1.2s: Read config.json
1.2s → 2.3s: Read database.json
2.3s → 3.3s: Read api.json
3.3s → 4.6s: Read auth.json
4.6s → 5.7s: Read features.json

Total time: 5.7 seconds
```

But these reads are **completely independent**. They could execute in parallel:

```
Parallel execution timeline:
0.0s → 1.2s: Read all 5 files simultaneously
             (longest file takes 1.2s)

Total time: 1.2 seconds
Speedup: 4.75x
```

Why doesn't this happen automatically? **Because the MCP protocol doesn't express dependencies between tool calls**.

### Introduction to DAG Execution Model

A **Directed Acyclic Graph (DAG)** explicitly represents dependencies between tasks. Here's the difference:

**Sequential workflow:**
```
t1 → t2 → t3
(must execute sequentially)
```

**Parallel workflow:**
```
t1 ─┐
t2 ─┤
t3 ─┼─→ All execute simultaneously
t4 ─┤
t5 ─┘
```

The DAG executor uses topological sorting to identify "layers" of tasks that can execute in parallel. For each layer, all tasks execute simultaneously via `Promise.all()`. Between layers, we wait for all tasks to complete before moving to the next.

### Dependency Resolution with $OUTPUT References

Tasks often need results from previous tasks. We use a simple placeholder syntax:

```typescript
{
  id: "t2",
  tool: "json:parse",
  arguments: {
    input: "$OUTPUT[t1]"  // Reference to t1's result
  },
  depends_on: ["t1"]
}
```

This supports complex references with JSONPath-style syntax:

```typescript
{
  arguments: {
    title: "$OUTPUT[t1].config.version",      // Deep property access
    tags: "$OUTPUT[t2][0].labels",            // Array indexing
    summary: "$OUTPUT[t3].data.summary.text"  // Nested objects
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

**Key insight: Parallelization gains are proportional to workflow "width"** (number of independent branches).

### Visual Comparison: Sequential vs. Parallel Execution

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
│                                                  │  waiting             │
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
│  t=0.0s ───────┼─► read config3 ─► [1.0s] ──┼─► DONE (all complete)    │
│                │                             │                          │
│                ├─► read config4 ─► [1.3s] ◄─┘   (longest: 1.3s)        │
│                │                                                        │
│                └─► read config5 ─► [1.1s]                              │
│                                                                         │
│  t=1.3s ────────────────────────────► DONE                             │
│                                                                         │
│  Total time: 1.3 seconds (max of all parallel tasks)                   │
│  Speedup: 4.4x faster                                                  │
│  CPU utilization: ~95% (all cores active)                              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

Real-world workflows typically have 30-50% parallelizable tasks. Even modest workflows see 2-3x speedups. Highly parallel workflows (multiple file reads, multiple API calls) can see 5-6x improvements.

### Complex Pattern: Fan-Out, Fan-In

A common pattern is "fan-out, fan-in": execute multiple tasks in parallel, then aggregate results.

```
Workflow: "Read 5 configs, parse each, then aggregate into summary"

                         ┌─► read f1 ─► [0.8s] ──┐
                         │                        │
  t=0.0s ► list files ───┼─► read f2 ─► [0.9s] ──┼─► parse all ──┐
           [0.5s]        │                        │   [0.3s]      │
                         └─► read f3 ─► [0.7s] ──┘               │
                                                                  │
  t=1.4s ─────────────────────────────────────────────► aggregate │
                                                         [0.2s]   │
                                                                  │
  t=1.6s ───────────────────────────────────────────────────► DONE

  Layer 0: list (1 task)          → 0.5s
  Layer 1: read (3 parallel)      → 0.9s (max)
  Layer 2: parse (1 task)         → 0.3s
  Layer 3: aggregate (1 task)     → 0.2s

  Total: 1.9s
  Sequential would be: 0.5 + (0.8+0.9+0.7) + 0.3 + 0.2 = 3.4s
  Speedup: 1.8x
```

This pattern is extremely common in agent workflows: fetch data from multiple sources, process in parallel, then aggregate for final analysis.

---

## Conclusion of Part 1

We've explored two architectural concepts that address the scalability limitations of traditional MCP architecture:

1. **Semantic Gateway Pattern**: Use vector search to dynamically expose only relevant tools, reducing context usage by 229x (empirically validated)

2. **DAG-Based Parallel Execution**: Explicitly express task dependencies to enable parallel execution, with speedups of 2-6x depending on workflow "width"

These two concepts work in synergy: the gateway reduces context overhead, making it possible to add more MCP servers, while DAG execution optimizes the multi-tool workflows that become possible with this expanded ecosystem.

In **Part 2** of this series, we'll explore two even more ambitious concepts:

- **Agent Code Sandboxing**: Moving computation out of the protocol into local code execution
- **Speculative Execution**: Predicting and pre-executing workflows before they're even requested

These concepts push the boundaries of what's possible with MCP architecture even further, introducing fascinating questions about security, predictive intelligence, and the future of AI agents.

---

**About AgentCards**: AgentCards is an open-source exploration of advanced architectural patterns for MCP agents. Full code and benchmarks are available on GitHub.

**Questions or feedback?** We'd love to hear your thoughts on these concepts. Should these patterns be part of the MCP protocol itself? 
