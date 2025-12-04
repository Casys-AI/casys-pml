# Casys MCP Gateway (Part 4): Claude as Strategic Orchestrator

**Author:** Erwan Lee Pesle
**Date:** December 2025
**Series:** Casys MCP Gateway Architecture

---

*In [Part 3](linkedin-casys-code-sandboxing.md), we implemented code sandboxing with MCP tools injection. Today, we explore where this leads: transforming Claude from a tool caller into a strategic orchestrator.*

---

## Recap: Two Problems We Solved

When you connect Claude to MCP servers, two things happen that kill productivity:

### Problem 1: Context Saturation (30-50% wasted)

Before Claude even starts working, tool schemas consume 30-50% of the context window. With 15 MCP servers? You've lost half your conversation space to JSON schemas Claude might never use.

**Our solution**: Semantic search + GraphRAG. Casys MCP Gateway loads only relevant tools on-demand, reducing context usage to <5%.

### Problem 2: Sequential Latency (5x slower)

Every tool call is a round-trip. Read file → wait → parse → wait → create issue → wait. Five tools = five round-trips = frustrated users.

**Our solution**: DAG execution. Independent tasks run in parallel. That 5x latency becomes 1x.

But we've learned something bigger while building this...

## What We Built (and What We Learned)

### GraphRAG: The Learning Graph

We didn't just build tool search. We built a graph that learns.

Every time you run a workflow, Casys MCP Gateway records which tools were used together. `filesystem:read_file` followed by `memory:create_entities`? That's an edge in the graph. Run it 10 times? The edge gets stronger (confidence score increases).

**Real example from our dashboard**: After a few DAG executions, we watched the graph visualization update in real-time via SSE. New edges appeared. PageRank recalculated. The system was learning which tools belong together.

This isn't just logging - it's **hybrid search**. When you search for tools, we combine:
- Semantic similarity (embeddings, BGE-Large-EN-v1.5)
- Graph relatedness (Adamic-Adar algorithm)
- Adaptive weighting based on graph density

Cold start with empty graph? Semantic dominates. Rich graph with patterns? Graph recommendations boost relevant tools.

### The Cold Start Problem (ADR-026)

We hit a wall: with an empty graph, our confidence formula returned 0 even for good semantic matches.

```
confidence = semantic * 0.55 + pageRank * 0.30 + pathStrength * 0.15
```

PageRank = 0 when graph is empty. Confidence tanks. Suggestions fail.

**Solution**: Adaptive weights based on graph density. Sparse graph? Trust semantic (0.85 weight). Dense graph? Balance with graph signals. The system bootstraps itself.

### DAG vs Code Execution: When to Use What

We have two execution modes, each with a purpose:

| | `execute_dag` | `execute_code` |
|---|---|---|
| **Structure** | Declarative, layers | Imperative, dynamic |
| **Best for** | Orchestration, parallel tasks | Complex logic, data processing |
| **Learning** | Full tracking | Tracking coming (ADR-027) |

DAG is transparent - Claude sees each step. Code execution is powerful - loops, conditionals, try/catch, the full language.

## The Vision: Claude as CEO

What if Claude could work like a CEO instead of a line worker?

```
┌─────────────────────────────────────────────────────────────┐
│  CLAUDE (Strategic Orchestrator)                            │
│                                                              │
│  "Analyze this week's commits and create a report"          │
│                                                              │
│  1. Search snippet library → "I've solved this before"      │
│  2. Delegate to Casys MCP Gateway                             │
│  3. Receive summary: { contributors: 5, commits: 47 }       │
│                                                              │
│  Context used: ~100 tokens (not 10,000)                     │
└─────────────────────────────────────────────────────────────┘
                          │
              IPC (progress, logs, result)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  CASYS MCP GATEWAY (Autonomous Execution Engine)            │
│                                                              │
│  - Executes code in secure Deno sandbox                     │
│  - Calls MCP tools (through gateway, not direct)            │
│  - Handles errors, retries, edge cases                      │
│  - Tracks patterns → GraphRAG learning                      │
│  - Returns condensed result                                  │
└─────────────────────────────────────────────────────────────┘
```

## How It Works

### 1. Code Execution in Sandbox

Instead of Claude calling tools one-by-one, it writes (or retrieves) code:

```typescript
// Claude sends this to Casys MCP Gateway
await casys_gateway.execute_code({
  intent: "Analyze weekly commits",
  code: `
    const commits = await github.listCommits({ limit: 1000 });
    const thisWeek = commits.filter(c => isThisWeek(c.date));

    return {
      total: thisWeek.length,
      byAuthor: groupBy(thisWeek, 'author'),
      topFiles: getMostChanged(thisWeek)
    };
  `
});
```

### 2. MCP Tools Available in Sandbox

The code runs in an isolated Deno subprocess, but can call MCP tools:

```typescript
// Inside sandbox - these calls go through Casys MCP Gateway
const files = await filesystem.readDir("./src");
const issues = await github.listIssues({ state: "open" });
await memory.createEntities({ entities: [...] });
```

The sandbox is secure (no direct filesystem access), but MCP tools provide controlled access to external resources.

### 3. Learning from Execution

Here's where it gets interesting. Casys MCP Gateway tracks:

- **Which tools were called together** → GraphRAG learns co-occurrence
- **Which code patterns succeeded** → Snippet library grows
- **Which intents map to which code** → Future suggestions improve

```typescript
// After execution, Casys MCP Gateway records:
{
  intent: "Analyze weekly commits",
  toolsUsed: ["github:list_commits", "memory:create_entities"],
  executionTime: 3200,
  success: true,
  codeFingerprint: "abc123"  // For deduplication
}
```

### 4. Progress Streaming

For long-running tasks, Claude receives progress updates:

```typescript
{ type: "progress", step: "Fetching commits", done: 250, total: 1000 }
{ type: "progress", step: "Processing", done: 800, total: 1000 }
{ type: "result", success: true, data: { ... } }
```

Claude stays informed without being overwhelmed.

## The Learning Loops

### Loop 1: Execution Learning
Every successful execution teaches the graph which tools work well together.

### Loop 2: Snippet Ranking
Code that succeeds repeatedly gets promoted. Code that fails gets deprioritized.

### Loop 3: Error Learning
When things fail, Casys MCP Gateway remembers why. Next time, it can warn Claude or suggest alternatives.

### Loop 4: Performance Optimization
"This pattern takes 3s, but this alternative takes 0.5s" - learned automatically.

## Why This Matters

### For Context Efficiency
- Current: 1000 commits = 10,000+ tokens in Claude's context
- With delegation: Summary = 100 tokens

### For Reliability
- Current: Claude manages every step, any failure breaks the chain
- With delegation: Casys MCP Gateway handles retries, errors, edge cases

### For Learning
- Current: Each conversation starts fresh
- With delegation: Patterns learned persist across sessions

### For Speed
- Current: Sequential tool calls, one at a time
- With delegation: Parallel execution, automatic optimization

## The Roadmap

We're building this incrementally:

1. **Now**: DAG execution with GraphRAG learning
2. **Next**: Accurate tool tracking in code execution (ADR-027)
3. **Future**: Code snippet library with semantic retrieval
4. **Vision**: Full orchestrator mode with autonomous delegation

## Try It Today

Casys MCP Gateway is open source. The foundation is already working:

```bash
git clone https://github.com/Casys-AI/mcp-gateway.git
cd mcp-gateway
deno task serve:playground
```

The `execute_code` tool is available. The learning loops are active. The future is being built.

---

*Casys MCP Gateway: Turning AI from tool users into strategic orchestrators.*

[GitHub](https://github.com/Casys-AI/mcp-gateway) | [Documentation](https://github.com/Casys-AI/mcp-gateway/docs)

---

### Series Navigation

- **Part 1:** [Casys MCP Gateway Architecture](linkedin-casys-mcp-gateway.md) - The Gateway Pattern
- **Part 2:** [GraphRAG for Tool Discovery](linkedin-casys-graphrag.md) - Semantic + Graph Hybrid Search
- **Part 3:** [Code Sandboxing](linkedin-casys-code-sandboxing.md) - Secure Deno Execution with MCP Tools
- **Part 4:** Claude as Strategic Orchestrator *(this article)*
