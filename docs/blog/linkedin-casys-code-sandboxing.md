# MCP Gateway Architecture (Part 3): Code Sandboxing + MCP Tools Injection

**Author:** Erwan Lee Pesle **Date:** November 2025 **Series:** MCP Gateway Architecture

---

## The Context Inflation Problem

Current MCP workflows suffer from a fundamental issue: **intermediate results bloat the context**.

**Concrete example:**

You ask: "Analyze last week's commits in the foo repo"

```
┌─────────────────────────────────────────────────────────────────────┐
│  TRADITIONAL TOOL CALLS APPROACH                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Turn 1    Agent ──────► "List commits"                             │
│            Tool  ◄────── 1000 commits (500K tokens)                 │
│                          ▼                                          │
│  Turn 2    Agent ──────► "Filter last week"                         │
│            (reasoning over 500K tokens in context)                  │
│                          ▼                                          │
│  Turn 3    Agent ──────► "Summarize by author"                      │
│            Result ◄───── Top 5 authors                              │
│                                                                     │
│  Total: 3-5 LLM turns │ 500K tokens │ 8-12s                         │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  CODE EXECUTION APPROACH                                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Turn 1    Agent ──────► Generates TypeScript code                  │
│            Sandbox ────► Executes locally (filter, aggregate)       │
│            Result ◄───── Top 5 authors (500 tokens)                 │
│                                                                     │
│  Total: 1 LLM turn │ 2.7K tokens │ ~2s                              │
└─────────────────────────────────────────────────────────────────────┘
```

**Potential gains:** 75% fewer LLM turns, ~99% fewer context tokens.

---

## Anthropic Code Execution: The Concept

Anthropic proposed this solution in
["Code execution with MCP"](https://www.anthropic.com/engineering/code-execution-with-mcp):

> "Running agent-generated code requires a secure execution environment with appropriate sandboxing,
> resource limits, and monitoring."

**Their approach:**

- The agent generates TypeScript code instead of making multiple tool calls
- MCP servers are exposed as importable files (`./servers/github/`)
- The agent explores the filesystem and uses `search_tools` to discover tools

**What they don't detail:** How to implement the sandbox.

---

## Our Contribution: Concrete Implementation

This is where our exploration comes in. We propose a **tested implementation** of the concept:

| Aspect                    | Anthropic (concept)   | Our implementation                         |
| ------------------------- | --------------------- | ------------------------------------------ |
| **Sandbox**               | "A sandbox is needed" | Deno with granular permissions             |
| **Technology**            | Not specified         | `--deny-write`, `--deny-net`, `--deny-run` |
| **MCP tools access**      | Filesystem imports    | Direct injection                           |
| **Security tests**        | Not detailed          | 200+ tests (isolation, timeout, memory)    |
| **Benchmarks**            | Not provided          | 71ms execution, 99.99% context savings     |
| **Architectural pattern** | Context reduction     | + Speculative Resilience                   |

### What the Sandbox Unlocks: Speculative Resilience

Beyond context reduction, the sandbox enables a powerful architectural pattern.

**The problem with direct MCP tools:**

- External side effects (create GitHub issue, write file)
- Failure = potentially irreversible consequences
- Retry = risk of duplication

**What the sandbox enables:**

```
┌──────────────────────────────────────────────────────────────────┐
│  SPECULATIVE RESILIENCE                                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Prediction: "Agent will request commit analysis"                │
│                         │                                        │
│         ┌───────────────┼───────────────┐                        │
│         ▼               ▼               ▼                        │
│    ┌─────────┐    ┌─────────┐    ┌─────────┐                     │
│    │ Sandbox │    │ Sandbox │    │ Sandbox │                     │
│    │  Fast   │    │   ML    │    │  Stats  │                     │
│    └────┬────┘    └────┬────┘    └────┬────┘                     │
│         │              │              │                          │
│         ▼              ▼              ▼                          │
│      [OK ✓]        [Timeout]      [OK ✓]                         │
│         │                             │                          │
│         └──────────┬──────────────────┘                          │
│                    ▼                                             │
│              Consolidation                                       │
│         (keep successes, ignore failures)                        │
│                                                                  │
│  ✓ Safe-to-fail: failures without consequences                   │
│  ✓ Risk-free retry: idempotent                                   │
│  ✓ 0ms perceived latency if prediction correct                   │
└──────────────────────────────────────────────────────────────────┘
```

**1. Safe-to-fail branches**: Sandbox code is isolated. Branches can fail without compromising the
workflow.

**2. Aggressive speculation**: Execute multiple approaches in parallel, keep successes, ignore
failures.

**3. Risk-free retry**: Re-execute without effect duplication.

**4. Graceful degradation**: Automatic fallback if an approach times out.

---

## Technical Architecture

### Secure Deno Sandbox

We chose **Deno** for its secure-by-default model:

```
┌─────────────────────────────────────────────────────────────────┐
│  SANDBOX ARCHITECTURE                                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  LLM Agent                                                      │
│      │                                                          │
│      ▼ (generates TypeScript code)                              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  MCP Gateway                                            │    │
│  │      │                                                  │    │
│  │      ▼                                                  │    │
│  │  ┌───────────────────────────────────────────────────┐  │    │
│  │  │  Context Builder                                  │  │    │
│  │  │  - Vector search → top-5 relevant tools           │  │    │
│  │  │  - Generates typed TypeScript wrappers            │  │    │
│  │  └───────────────────────────────────────────────────┘  │    │
│  │      │                                                  │    │
│  │      ▼                                                  │    │
│  │  ┌───────────────────────────────────────────────────┐  │    │
│  │  │  Deno Sandbox (isolated subprocess)               │  │    │
│  │  │  --deny-write --deny-net --deny-run --deny-env    │  │    │
│  │  │  --allow-read=/workspace (if needed)              │  │    │
│  │  │                                                   │  │    │
│  │  │  Limits: 512MB RAM, 30s timeout                   │  │    │
│  │  └───────────────────────────────────────────────────┘  │    │
│  │      │                                                  │    │
│  │      ▼ (MCP calls via message passing)                  │    │
│  │  ┌───────────────────────────────────────────────────┐  │    │
│  │  │  MCP Servers (GitHub, Filesystem, etc.)           │  │    │
│  │  └───────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────┘    │
│      │                                                          │
│      ▼ (aggregated result, ~500 tokens)                         │
│  LLM Agent                                                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Multi-layered security:**

- Layer 1: OS process isolation (separate subprocess)
- Layer 2: Granular Deno permissions
- Layer 3: Resource limits (RAM, timeout)
- Layer 4: Input/output validation (JSON-only)

### MCP Tools Injection

**Two approaches compared:**

|                | Anthropic (filesystem)                           | Our exploration (injection)       |
| -------------- | ------------------------------------------------ | --------------------------------- |
| **Agent code** | `import { listCommits } from './servers/github'` | `await github.listCommits({...})` |
| **Discovery**  | Explore filesystem + `search_tools`              | Vector search (similarity > 0.6)  |
| **Advantage**  | Familiar (standard imports)                      | No imports, already injected      |

**Open question:** Which approach offers the best DX? Comparative benchmarks to be done.

---

## Use Cases

### Scenario: Large Data Aggregation

**Goal:** Analyze 10MB of logs to identify top 10 errors

**Traditional approach (tool calls):**

```
Turn 1: Read file → 10MB in context (!)
Turn 2: Agent filters ERRORs
Turn 3: Agent counts by type
Turn 4: Agent sorts and formats
Total: 4 turns, context saturated
```

**Code execution approach:**

```typescript
// SINGLE turn - the agent generates this code
const logs = await filesystem.readFile("/var/log/app.log");
const lines = logs.split("\n");

const errorsByType = lines
  .filter((line) => line.includes("ERROR"))
  .reduce((acc, line) => {
    const type = line.match(/ERROR: (\w+)/)?.[1] || "Unknown";
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

return Object.entries(errorsByType)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);

// Input: 10MB │ Output: ~500 bytes │ Reduction: 99.995%
```

### Scenario: Parallel Multi-Source Workflow

```typescript
// 3 MCP calls in parallel (instead of 3 sequential turns)
const [commits, issues, prs] = await Promise.all([
  github.listCommits({ repo: "foo", since: "2024-01-01" }),
  github.listIssues({ repo: "foo", state: "closed" }),
  github.listPullRequests({ repo: "foo", state: "merged" }),
]);

return {
  commits: commits.length,
  issues_closed: issues.length,
  prs_merged: prs.length,
  top_contributors: getTopContributors(commits, prs),
};
```

---

## Benchmarks

### Real Measurements (E2E Tests)

Tests on Ubuntu Linux (Deno 2.x) - run on publication day:

| Metric                             | Measured    | Target | Status |
| ---------------------------------- | ----------- | ------ | ------ |
| Simple execution (`return 1+1`)    | **71ms**    | <500ms | ✅     |
| Cache hit latency                  | **<0.01ms** | <50ms  | ✅     |
| 1000 items (filter + aggregate)    | **74ms**    | <3s    | ✅     |
| 5 concurrent executions            | **40ms**    | -      | ✅     |
| Context savings (537KB → 38 bytes) | **99.99%**  | >99%   | ✅     |

**Note:** Synthetic data (items generated in memory), no real network calls.

### Projections (Not Measured)

The following gains are **theoretical estimates** based on the concept:

| Scenario                     | Tool Calls (estimated) | Code Execution (estimated) |
| ---------------------------- | ---------------------- | -------------------------- |
| 1000 commits → top 5 authors | ~8-12s, 4 turns        | ~2s, 1 turn                |
| 10MB logs → top 10 errors    | Context saturated      | ~500 bytes return          |

**To be validated** with end-to-end benchmarks on real cases.

---

## Security: Defense in Depth

### Isolation Tests

**Filesystem:**

```typescript
// ❌ Blocked
await Deno.readFile("/etc/passwd");
// Error: PermissionDenied

// ✅ Allowed (if whitelist configured)
await Deno.readFile("/workspace/codebase/config.json");
```

**Network:**

```typescript
// ❌ Blocked
await fetch("https://evil.com");
// Error: PermissionDenied

// ✅ Allowed (via MCP gateway)
await github.listCommits({ repo: "foo" });
```

**Subprocess:**

```typescript
// ❌ Blocked
new Deno.Command("rm", { args: ["-rf", "/"] });
// Error: PermissionDenied
```

**Coverage:** 200+ tests total (isolation, security, cache, PII, performance).

---

## Limitations and Trade-offs

### When to Use Code Sandboxing

**✅ Excellent for:**

- Large datasets (1MB+) → compact summary
- Multi-step transformations on the same data
- Complex filtering/aggregation logic
- Parallelizable workflows

**❌ Not optimal for:**

- Simple operations (read 1 file, return as-is)
- Tasks requiring complex semantic reasoning
- Workflows where the agent must decide strategy mid-stream

### Complementarity with Adaptive Loops

```
Agent discovers large dataset
  ↓ Adaptive Loop decides: "code execution"
  ↓ Generates code with MCP tools
  ↓ Sandbox executes (safe-to-fail)
  ↓ Returns summary
  ↓ Meta-Learning: "Dataset >1MB → code execution optimal"
```

---

## Conclusion

Anthropic laid out a powerful concept: execute generated code to reduce context. But they leave the
sandbox implementation open.

**Our contribution**: a concrete implementation with Deno that we share.

### What We Built

- **Deno Sandbox**: Granular permissions, 200+ tests
- **Measured performance**: 71ms execution, 99.99% context savings
- **Speculative Resilience**: Safe-to-fail for aggressive parallelization
- **Production-ready**: Timeout, memory limits, error handling

### What We Learned

1. **Deno works well** for sandboxing - lightweight, cross-platform, secure by default
2. **Sandbox unlocks speculation**: isolation = failures without consequences
3. **Context gains are confirmed**: 99.99% measured (537KB → 38 bytes)

### Open Questions

- Deno vs containers/VMs for high-security cases?
- Filesystem imports vs injection: which has better DX?
- Optimal confidence thresholds for aggressive speculation?

---

**About this series:**

- **Part 1:**
  [Semantic Discovery and Parallel Execution](https://www.linkedin.com/pulse/mcp-gateway-architecture-part-1-semantic-discovery-erwan-lee-pesle-kiczf/)
- **Part 2:**
  [Adaptive Workflows with AIL/HIL](https://www.linkedin.com/pulse/mcp-gateway-architecture-part-2-adaptive-workflows-erwan-lee-pesle/)
- **Part 3:** Code Sandboxing + MCP Tools Injection (this article)
