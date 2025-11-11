# Claude UX Journey: GraphRAG + Speculative Execution

**Date:** 2025-11-03
**Approach:** Intent-based with automatic workflow inference
**Key Feature:** Speculative execution (THE differentiator)

---

## 🎯 Core Concept

**Claude n'a PAS besoin de générer des workflows explicites.**

Au lieu de demander à Claude de construire des DAG structures complexes, AgentCards utilise:
- **Vector search** pour semantic matching
- **GraphRAG** pour dependency inference
- **Speculative execution** pour 0ms latency

---

## 🚀 Three Execution Modes

### Mode 1: explicit_required (confidence < 0.70)

**Quand:** Aucun pattern trouvé dans la base de données

**Claude UX:**
```
User: "Do something very unusual that's never been done before"
↓
AgentCards: No confident pattern found (confidence: 0.35)
↓
Claude: "I need to provide an explicit workflow for this"
```

**Format explicite (fallback):**
```json
{
  "workflow": {
    "tasks": [
      {"id": "task1", "tool": "server:tool", "arguments": {...}, "depends_on": []},
      {"id": "task2", "tool": "server:tool2", "arguments": {...}, "depends_on": ["task1"]}
    ]
  }
}
```

**Cognitive Load:** ⚠️ Medium (fallback seulement)

---

### Mode 2: suggestion (0.70-0.85 confidence)

**Quand:** Bon pattern trouvé, mais pas assez confiant pour exécuter

**Claude UX:**
```
User: "Read config.json and create a GitHub issue"
↓
AgentCards: Found pattern (confidence: 0.78)
           Suggested DAG: read → parse → create_issue
↓
Claude: Sees suggestion + explanation
        "This looks good, let me execute it"
```

**Response Format:**
```json
{
  "mode": "suggestion",
  "confidence": 0.78,
  "suggested_dag": {
    "tasks": [...]
  },
  "rationale": "Based on 15 similar workflows",
  "dependency_paths": [
    "filesystem:read → json:parse (direct dependency)",
    "json:parse → github:create_issue (2 hops)"
  ]
}
```

**Cognitive Load:** ✅ Low (review + approve)

---

### Mode 3: speculative_execution (>0.85 confidence) 🚀

**Quand:** High confidence - THE FEATURE

**Claude UX:**
```
User: "Read all JSON files and summarize them"
↓
AgentCards: High confidence pattern (0.92)
           🚀 EXECUTES IMMEDIATELY while Claude thinks
           Results ready in <300ms
↓
Claude: Sees COMPLETED results instantly
        "Perfect, here are the results..."
```

**Response Format:**
```json
{
  "mode": "speculative_execution",
  "confidence": 0.92,
  "results": [
    {"task": "read_config", "output": {...}},
    {"task": "read_package", "output": {...}},
    {"task": "merge", "output": {...}}
  ],
  "execution_time_ms": 247,
  "note": "✨ Results prepared speculatively - ready immediately"
}
```

**Cognitive Load:** ✅✅ Minimal (0ms perceived wait)

**Safety:**
- Never on dangerous ops (delete, deploy, payment)
- Cost limit: <$0.10
- Time limit: <5s execution
- Graceful fallback si échec

---

## 📊 User Journey Comparison

### Scenario: "Read 3 files in parallel, then merge"

#### OLD Approach (Explicit DAG)
```
User → Claude
Claude: Must construct explicit JSON:
{
  "workflow": {
    "tasks": [
      {"id": "r1", "tool": "fs:read", "depends_on": []},
      {"id": "r2", "tool": "fs:read", "depends_on": []},
      {"id": "r3", "tool": "fs:read", "depends_on": []},
      {"id": "merge", "tool": "json:merge", "depends_on": ["r1","r2","r3"]}
    ]
  }
}
→ AgentCards executes
→ Results in 2-5s
```

**Cognitive Load:** ⚠️⚠️ High (format, IDs, depends_on)

#### NEW Approach (GraphRAG + Speculative)
```
User → Claude
Claude: "Read these files and merge them"
→ AgentCards:
   1. Vector search: finds "read + merge" pattern
   2. GraphRAG: infers dependencies (parallel reads → merge)
   3. Confidence: 0.94 → SPECULATIVE EXECUTION
   4. Executes while Claude composes response
→ Results ready in <300ms ✨
Claude: "Here are the merged results..."
```

**Cognitive Load:** ✅ Minimal (natural language)

---

## 🧠 Cognitive Load Analysis

| Aspect | Explicit DAG | GraphRAG + Speculative |
|--------|--------------|------------------------|
| **Learn syntax** | Medium (workflow JSON) | None (natural language) |
| **Express intent** | High (structure DAG) | Low (describe goal) |
| **Debug** | Clear (see DAG) | Transparent (see explanation) |
| **Latency** | 2-5s sequential | <300ms speculative ✨ |
| **Trust** | Explicit = predictable | Confidence scores + paths |
| **Effort** | Higher initial | Minimal ongoing |

---

## 💡 Claude Prompt Pattern

**Recommended Claude System Prompt:**

```markdown
You have access to AgentCards, an intelligent MCP gateway that:

1. **Automatically infers workflows** from natural language intents
2. **Executes speculatively** when confidence is high (>85%)
3. **Provides suggestions** when confidence is medium (70-85%)
4. **Requests explicit workflow** when no pattern found (<70%)

When the user asks you to perform multi-step tasks:
- Simply describe the intent in natural language
- AgentCards will suggest or execute the optimal workflow
- Review suggestions before confirming (if not already executed)
- For dangerous operations, AgentCards always asks for confirmation

Example intent format:
{
  "intent": {
    "naturalLanguageQuery": "Read all JSON files and create a summary report",
    "toolsConsidered": ["filesystem:read", "json:parse", "report:create"]
  }
}

AgentCards response modes:
- ✨ speculative_execution: Results already prepared (0ms wait)
- 💡 suggestion: Review proposed DAG before executing
- ⚠️ explicit_required: Please provide explicit workflow structure
```

**Claude doesn't need to learn custom syntax - just natural language! 🎉**

---

## 🎯 Example Workflows

### Example 1: Parallel File Reads (Speculative)

**User:** "Read config.json, package.json, and README.md"

**Claude → AgentCards:**
```json
{
  "intent": {
    "naturalLanguageQuery": "Read config.json, package.json, and README.md"
  }
}
```

**AgentCards Response (Speculative - 0.96 confidence):**
```json
{
  "mode": "speculative_execution",
  "confidence": 0.96,
  "results": [
    {"task": "read_config", "output": "..."},
    {"task": "read_package", "output": "..."},
    {"task": "read_readme", "output": "..."}
  ],
  "execution_time_ms": 123,
  "parallelization_speedup": "3x"
}
```

**Claude → User:** "I've read all three files. Here's what they contain..."

**User Experience:** 🚀 Instant

---

### Example 2: Sequential Workflow (Suggestion)

**User:** "Read config.json, parse it, then create a GitHub issue"

**Claude → AgentCards:**
```json
{
  "intent": {
    "naturalLanguageQuery": "Read config.json, parse it, then create a GitHub issue"
  }
}
```

**AgentCards Response (Suggestion - 0.82 confidence):**
```json
{
  "mode": "suggestion",
  "confidence": 0.82,
  "suggested_dag": {
    "tasks": [
      {"id": "read", "tool": "filesystem:read", "depends_on": []},
      {"id": "parse", "tool": "json:parse", "depends_on": ["read"]},
      {"id": "issue", "tool": "github:create_issue", "depends_on": ["parse"]}
    ]
  },
  "rationale": "Based on 23 similar workflows",
  "dependency_paths": [
    "filesystem:read → json:parse (direct)",
    "json:parse → github:create_issue (direct)"
  ]
}
```

**Claude → User:** "I've prepared a workflow to do this. Let me execute it..."

**User Experience:** ✅ Transparent + controllable

---

### Example 3: Novel Workflow (Explicit Required)

**User:** "Do something completely new that's never been done"

**Claude → AgentCards:**
```json
{
  "intent": {
    "naturalLanguageQuery": "Do something completely new..."
  }
}
```

**AgentCards Response (Explicit Required - 0.42 confidence):**
```json
{
  "mode": "explicit_required",
  "confidence": 0.42,
  "message": "No confident pattern found. Please provide explicit workflow."
}
```

**Claude → AgentCards (Explicit Workflow):**
```json
{
  "workflow": {
    "tasks": [
      {"id": "custom1", "tool": "...", "depends_on": []},
      {"id": "custom2", "tool": "...", "depends_on": ["custom1"]}
    ]
  }
}
```

**User Experience:** ⚠️ More effort, but rare (<30% of workflows)

---

## 🔒 Safety Mechanisms

### Dangerous Operations Detection

AgentCards **never speculates** on:
- `delete`, `remove`, `destroy`
- `deploy`, `publish`
- `payment`, `charge`, `bill`
- `send_email`, `send_message`

**Behavior:** Falls back to `suggestion` mode with warning

```json
{
  "mode": "suggestion",
  "confidence": 0.94,
  "warning": "⚠️ Dangerous operations detected - review required",
  "suggested_dag": {...}
}
```

### Adaptive Learning

**Start conservative (0.92 threshold):**
- After 50-100 executions
- If success rate >95% → lower threshold (0.87)
- If success rate <80% → raise threshold (0.97)

**Target metrics:**
- Success rate: >95%
- User acceptance: >90%
- Waste rate: <10%

---

## 🎨 Design Philosophy

### Invisible When It Works

**Best UX = No UX**

When confidence is high:
- No format to learn
- No structure to build
- No waiting
- Just instant results ✨

### Transparent When Uncertain

When confidence is medium:
- Show suggested DAG
- Explain dependencies
- Let Claude/user confirm

### Helpful When Novel

When no pattern exists:
- Clear error message
- Format documentation
- Fall back to explicit mode

---

## 📈 Evolution Path

| Version | Capability | Status |
|---------|-----------|--------|
| **v1.0 (MVP)** | GraphRAG + Speculative | 🎯 Current |
| **v1.1** | Hybrid (explicit + intent) | Future |
| **v2.0** | Multi-user pattern sharing | Future |

---

**Status:** 🟢 READY FOR IMPLEMENTATION
**Decision:** Intent-based with speculative execution = THE approach
**Cognitive Load:** Minimal for Claude, instant for users

---

_Generated: 2025-11-03_
_Replaces: claude-ux-journey-analysis-OBSOLETE.md_
