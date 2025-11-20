# MCP Gateway Architecture (Part 2): Adaptive Workflows with AIL/HIL

**Author:** Erwan Lee Pesle
**Date:** November 2025
**Series:** MCP Gateway Architecture

---

*In [Part 1](https://www.linkedin.com/pulse/mcp-gateway-architecture-part-1-semantic-discovery-erwan-lee-pesle-kiczf/), we saw how semantic discovery and parallel execution solve MCP scalability issues. Today, we tackle a more fundamental problem: workflow rigidity in the face of unexpected discoveries.*

---

## The Problem: Inefficient Ad-Hoc Adaptation

LLM agents already adapt naturally—but they do it **inefficiently**.

Here's the problem: **adaptation happens reactively, turn-by-turn**.

**Concrete example:**

```
Task: "Analyze configuration files"

Typical LLM agent behavior:
Turn 1: List files → Discovers JSON, XML, YAML
Turn 2: Decides to parse JSON → Processes 8 files
Turn 3: Realizes XML exists → Processes 5 files
Turn 4: Discovers YAML → Processes 2 files

❌ Problems:
- 4 decision rounds (latency overhead)
- Sequential execution (no parallelization)
- Reactive discovery (tools found one-by-one)
- No learning (repeats this every time)
```

**What if we could make this adaptation proactive and efficient?**

---

## Agent-in-the-Loop (AIL): Formalizing Adaptation

The concept: **make ad-hoc adaptation observable and controllable**.

LLMs already adapt naturally, but it happens in a black box. AIL formalizes this process through structured decision points and command injection.

### How the formalization works

Instead of invisible reasoning, adaptation becomes explicit:

**Traditional LLM (invisible):**
```
Agent thinks: "I need XML parsers" → next turn uses them
(no visibility, no control, no logging)
```

**AIL formalized (observable):**
```
Agent executes: list_directory("/config")
  ↓ Result: 8 JSON, 5 XML, 2 YAML

📡 Event emitted: {type: "discovery", formats: ["json", "xml", "yaml"]}

Agent decision point activated:
  ↓ Query GraphRAG: "tools for XML/YAML parsing"

📡 Event emitted: {type: "replanning", tools: ["xml.parse", "yaml.load"]}

Agent injects: {type: "replan_dag", tools: ["xml.parse", "yaml.load"]}

DAG Executor rebuilds:
  Layer 0: list_directory [COMPLETED]
  Layer 1: [parse_json, parse_xml, parse_yaml] ← Dynamically added
  Layer 2: aggregate_results

📡 Event emitted: {type: "dag_updated", new_nodes: 2}
```

**Key insight:** This doesn't enable new capabilities—it **structures and exposes** what LLMs already do, enabling observability, control, and learning.

---

## Human-in-the-Loop (HIL): Validation for Critical Operations

Sometimes, total autonomy is not desirable. For sensitive operations, you want **human validation**.

### When to use HIL

- Destructive operations (file deletion, Git commits)
- Critical business decisions (expense approval)
- Security workflows (production deployments)
- Quality validation (generated code review)

### How it works

The workflow can **stop at a checkpoint** and request validation:

```
Workflow reaches HIL checkpoint
  ↓ Generates a summary:
  "Ready to deploy 47 modified files to production.
   Changes: 342 lines added, 89 deleted.
   Tests: 156/156 passed."

  ↓ Awaits human validation

Human responds:
  - ✅ Approve → Workflow continues
  - ❌ Reject → Workflow stops
  - 🔧 Modify → Injects modification commands → Continues
```

**Modification example:**
```json
{
  "decision": "modify",
  "commands": [
    { "type": "exclude_files", "pattern": "*.test.ts" },
    { "type": "add_review_comment", "text": "Deploying core files only" }
  ]
}
```

The workflow integrates these modifications and continues.

---

## 3-Loop Learning Architecture

The real power emerges when combining **three learning loops** operating at different time scales:

```
╔═══════════════════════════════════════════════════════════════════════╗
║           🔄 3-LOOP LEARNING ARCHITECTURE                             ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║  ⚡ Loop 1: EXECUTION (real-time - milliseconds)
║  ┌─────────────────────────────────────────────────────────────────┐
║  │  📡 Event Stream        → Complete observability                │
║  │  🎛️  Command Queue       → Dynamic control                      │
║  │  💾 State Management    → Automatic reducers                    │
║  │  💿 Checkpoint/Resume   → Interruption safe                     │
║  └─────────────────────────────────────────────────────────────────┘
║                            ↓ feed into ↓
║  🧠 Loop 2: ADAPTATION (runtime - seconds)
║  ┌─────────────────────────────────────────────────────────────────┐
║  │  🤖 AIL: Agent decides  → Autonomous replanning                 │
║  │  👤 HIL: Human validates → Critical approval                    │
║  │  🔀 DAG Replanning      → Dynamic modification                  │
║  └─────────────────────────────────────────────────────────────────┘
║                            ↓ feedback to ↓
║  🎓 Loop 3: META-LEARNING (continuous - long-term)
║  ┌─────────────────────────────────────────────────────────────────┐
║  │  🕸️  GraphRAG Updates   → Knowledge enrichment                  │
║  │  🔗 Co-occurrence       → Pattern learning                      │
║  │  📈 Self-improvement    → Each exec improves the next           │
║  └─────────────────────────────────────────────────────────────────┘
║
╚═══════════════════════════════════════════════════════════════════════╝
```

### Loop 1: Real-Time Observability and Control

**Event Stream:** Every workflow step emits events (`workflow_start`, `task_complete`, `checkpoint`, `error`). Complete real-time observability.

**Command Queue:** The agent (or human) can inject commands **during** execution: `{type: "replan_dag"}`, `{type: "abort"}`, `{type: "pause"}`. Non-blocking, processed between DAG layers.

**State Management:** Automatic reducers (inspired by LangGraph MessagesState) maintain state: messages, tasks, decisions, context. Automatic append/merge.

**Checkpoint/Resume:** The workflow can be interrupted and resumed. State is saved, allowing crash survival or asynchronous HIL validation.

### Loop 2: Adaptive Decisions During Execution

**Agent-in-the-Loop (AIL):** The agent can replan dynamically. XML file discovery → Agent injects `{replan_dag: "parse XML"}` → GraphRAG query → New nodes added to DAG → Execution continues.

**Human-in-the-Loop (HIL):** Human validation for critical operations. Checkpoint → Summary generated → Human review (Approve/Reject/Modify) → Commands injected → Workflow continues.

**DAG Replanning:** Unlike fixed DAGs, Casys rebuilds the DAG **during execution** via GraphRAG queries. Preserves completed tasks, adds new branches in parallel.

### Loop 3: Continuous Learning

**GraphRAG Updates:** After each workflow, the system enriches the knowledge graph.

Example: If `list_directory` and `parse_xml` are used together, the knowledge graph strengthens this relationship (weight +1). PageRank is recalculated. Future similar workflows benefit from learned patterns.

**Co-occurrence Learning:** The system learns which tools go together.

After 50 workflows on configuration files:
- `parse_json` co-occurs 95% with `list_directory`
- `parse_xml` co-occurs 60%
- `parse_yaml` co-occurs 30%

Result: The 51st similar workflow **automatically suggests all 3 parsers** from the start.

---

## Use Case: Configuration File Analysis

Let's compare LLM ad-hoc adaptation vs Casys structured approach on a real scenario.

```
╔═══════════════════════════════════════════════════════════════════════╗
║  📂 SCENARIO: "Analyze config files"                                 ║
║  Unexpected discovery: 8 JSON + 5 XML + 2 YAML                       ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║  🔄 LLM AD-HOC APPROACH       │  ✅ CASYS STRUCTURED APPROACH         ║
║  ─────────────────────────     │  ─────────────────────────────       ║
║                                 │                                     ║
║  Turn 1: list_directory        │  📡 Vector Search (upfront):        ║
║    ↓ Discovers: 8 JSON files   │    → Identifies all parsers needed  ║
║    ↓ Decides: parse JSON       │    → list_directory (0.94)          ║
║                                 │    → parse_json (0.89)              ║
║  Turn 2: parse_json (8 files)  │    → parse_xml (0.87)               ║
║    ↓ Sequential execution      │    → parse_yaml (0.85)              ║
║    ↓ Notices: XML files exist  │                                     ║
║                                 │  🔀 DAG Generated:                  ║
║  Turn 3: parse_xml (5 files)   │    Layer 0: list_directory          ║
║    ↓ Sequential execution      │    Layer 1: [json, xml, yaml] ⚡    ║
║    ↓ Notices: YAML files too   │    Layer 2: aggregate               ║
║                                 │                                     ║
║  Turn 4: parse_yaml (2 files)  │  ⚡ Parallel Execution:             ║
║    ↓ Sequential execution      │    → All 3 parsers run together     ║
║                                 │    → 4.75x faster than sequential   ║
║  ════════════════════           │                                     ║
║  Result: ✅ Complete (eventually)│  🎓 Loop 3: Meta-Learning         ║
║  Turns: 4 LLM rounds            │    → Pattern saved to GraphRAG     ║
║  Time: 8-12 seconds             │    → Next "config" task: suggests  ║
║  Execution: Sequential          │      all 3 parsers immediately     ║
║  Memory: Forgets next session   │                                     ║
║                                 │  ════════════════════               ║
║                                 │  Result: ✅ Complete                ║
║                                 │  Turns: 1 LLM round                 ║
║                                 │  Time: 2.1 seconds                  ║
║                                 │  Execution: Parallel                ║
║                                 │  Memory: Learns for next time       ║
║                                 │                                     ║
╚═══════════════════════════════════════════════════════════════════════╝
```

**Concrete results:**
- LLM ad-hoc: 4 turns, 8-12s, sequential, no learning
- Casys structured: 1 turn, 2.1s, parallel, learns pattern

**And on the 10th similar workflow:**
- LLM ad-hoc: Still 4 turns, still discovers tools one-by-one
- Casys: GraphRAG learned the pattern → suggests all 3 parsers upfront in workflow #11

---

## Positioning: What Doesn't Exist Elsewhere

### The LLM Adaptation Paradox

**LLMs like Claude already adapt naturally** - but in an inefficient way:

```
Task: "Analyze config files"

Claude's natural approach (ad-hoc adaptation):
  Turn 1: Decides → list_directory("/config")
  Turn 2: Sees JSON/XML/YAML → Decides → parse_json (only)
  Turn 3: Realizes XML exists → Decides → parse_xml
  Turn 4: Discovers YAML too → Decides → parse_yaml

  Result: 4 LLM turns, sequential execution, manual decisions at each step
```

**The problem isn't lack of adaptation—it's inefficiency:**
- ❌ Manual decision-making at each turn (latency overhead)
- ❌ Sequential execution (no parallelization)
- ❌ No memory across sessions (repeats the same discoveries)
- ❌ Black-box process (no observability)

### What Casys Actually Solves

**1. Pre-configured DAG via Vector Search (eliminates decision tours)**

Instead of discovering tools turn-by-turn, Casys identifies all relevant tools upfront:

```
User intent: "Analyze config files"
  ↓ Vector search (from Part 1):
    - filesystem:list_directory (0.94 similarity)
    - json:parse (0.89)
    - xml:parse (0.87)
    - yaml:load (0.85)

  ↓ DAG generated automatically:
    Layer 0: list_directory
    Layer 1: [parse_json, parse_xml, parse_yaml] ← Parallel execution
    Layer 2: aggregate_results

  Result: 1 decision turn → parallel execution
```

**2. Meta-Learning Across Sessions (GraphRAG)**

After 10 "config analysis" workflows, Casys learns the pattern:

```
Workflow #1-10: Discovers JSON+XML+YAML each time
Workflow #11: Automatically suggests all 3 parsers upfront
```

Claude forgets between sessions; Casys remembers.

**3. Formal Observability & Control**

```
Claude (ad-hoc):          Casys (formalized):
"Thinking..."             Event stream: checkpoint_reached
"Adapting plan..."        Command queue: {type: "replan_dag"}
(no visibility)           Observable state + external control
```

### Comparison Matrix

| Capability | Claude Code (LLM) | Anthropic Code Exec | Casys |
|-----------|-------------------|---------------------|-------|
| **Adaptation** | ✅ Ad-hoc (inefficient) | ❌ Fixed code execution | ✅ Pre-configured + adaptive |
| **Tool discovery** | 🔄 Turn-by-turn | ⚠️ Manual | ✅ Vector search upfront |
| **Execution mode** | ⏸️ Sequential | ⏸️ Sequential | ⚡ Parallel DAG |
| **Code execution** | ❌ | ✅ Sandbox | ✅ Sandbox + MCP tools |
| **Meta-learning** | ❌ Forgets each session | ❌ | ✅ GraphRAG |
| **Observability** | ❌ Black box | ⚠️ Basic | ✅ Event stream |
| **Human control (HIL)** | ❌ | ❌ | ✅ Checkpoint validation |

### The Real Innovation

**Casys doesn't enable adaptation—LLMs already do that.**

**Casys makes adaptation efficient:**
- **Proactive** (vector search predicts tools) vs **Reactive** (discover turn-by-turn)
- **Parallel** (DAG layers execute simultaneously) vs **Sequential** (wait for each result)
- **Learning** (patterns improve over time) vs **Amnesic** (restart from scratch)
- **Observable** (event stream + control) vs **Black-box** (hope for the best)

**Example impact:**
- LLM natural approach: 4 turns, 8-12s, sequential
- Casys approach: 1 turn, 2.1s, parallel
- Speedup: 4-6x, with learning for next time

---

## Technical Implementation

### Modular Architecture

Adaptive loops are implemented through several components working together:

**Event Stream:**
- 9 event types (workflow_start, task_complete, checkpoint, error, etc.)
- Real-time emission via observers
- Used for logging, debugging, monitoring

**Command Queue:**
- Non-blocking command queue
- Injection possible during execution (replan_dag, pause, abort, modify)
- Processing between DAG layers

**State Management:**
- Reducers inspired by LangGraph
- Workflow state: messages, tasks, decisions, context
- Automatic update merging

**DAG Replanning:**
- GraphRAG query based on discoveries
- Dynamic construction of new nodes
- Preservation of completed tasks (no re-execution)

### Performance Metrics

Real benchmarks comparing approaches:

**Structured vs ad-hoc replanning:** 5x speedup
- LLM ad-hoc with multiple turns: 23.4s
- Formalized AIL with DAG replanning: 4.7s

**Infrastructure overhead (formalization cost):**
- State update latency: 3ms (target <10ms) ✅
- Event emission overhead: <5ms P95 ✅
- Command injection latency: <10ms P95 ✅

**Key finding:** Formalization overhead is negligible compared to eliminating decision rounds.

---

## Concrete Use Cases

### 1. Multi-Language Codebase Analysis

```
Task: "Analyze this project and identify dependencies"

Initial DAG: Python analysis
  ↓ Discovers: TypeScript, Rust also present

AIL Decision: Adds TS and Rust analyzers
  ↓ New DAG: [Python, TypeScript, Rust] in parallel

Result: Complete analysis in a single execution
```

### 2. CI/CD Pipeline with Human Validation

```
DAG: build → test → deploy

HIL Checkpoint before deploy:
  "156 tests passed, ready to deploy"


Human: Approve

Workflow: Continues to production
```

### 3. Data Pipeline with Format Discovery

```
Task: "Import data from /exports directory"

Initial DAG: CSV import
  ↓ Discovers: CSV, JSON, Parquet

AIL: Adds JSON and Parquet parsers
  ↓ All formats processed automatically

Loop 3: Next time, suggests all 3 parsers upfront
```

---

## Conclusion: Three Architectural Concepts

This article introduced three complementary concepts for making LLM agent workflows more efficient:

### Loop 1: Execution Infrastructure
**Concept:** Make workflow state observable and controllable.
- Event streams for real-time visibility
- Command queues for external control
- State reducers for automatic merging
- Checkpoint/resume for fault tolerance

**Value:** Black-box reasoning becomes transparent and debuggable.

### Loop 2: Formalized Adaptation
**Concept:** Structure what LLMs do naturally.
- **AIL:** Agent replanning through explicit decision points
- **HIL:** Human validation at critical checkpoints
- **DAG replanning:** Dynamic workflow modification with preserved state

**Value:** Ad-hoc adaptation becomes efficient, observable, and controllable.

### Loop 3: Meta-Learning
**Concept:** Learn patterns across workflow executions.
- GraphRAG enrichment from tool co-occurrence
- Pattern recognition for proactive suggestions
- Continuous improvement without manual tuning

**Value:** Amnesic workflows become self-improving systems.

---

## The Core Insight

**LLMs already adapt—they're just inefficient at it.**

The architectural contribution isn't enabling adaptation, but **making it:**
- ⚡ **Proactive** (vector search predicts needs)
- 🔀 **Parallel** (DAG execution eliminates sequential waits)
- 🧠 **Learning** (GraphRAG remembers patterns)
- 👁️ **Observable** (event streams expose reasoning)

**Impact:** 4-6x speedup on multi-tool workflows, with continuous improvement over time.

---

**This series:**
- **Part 1:** [Semantic Discovery and Parallel Execution](https://www.linkedin.com/pulse/mcp-gateway-architecture-part-1-semantic-discovery-erwan-lee-pesle-kiczf/) - Vector search + DAG execution
- **Part 2:** Adaptive Workflows with AIL/HIL (this article) - Formalized adaptation + meta-learning
- **Part 3:** Code Sandboxing + MCP Tools Injection (coming soon) - Local execution + context reduction

**These concepts** are explored in the Casys MCP Gateway project, demonstrating how to structure and optimize LLM agent workflows at scale.
