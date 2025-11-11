# Claude UX Journey Analysis: AgentCards Interaction Patterns

**Date:** 2025-11-03
**Auteur:** BMad
**Objectif:** Analyser comment Claude (LLM agent) va interagir avec AgentCards pour choisir la meilleure approche DAG

---

## 🎭 Personas Claude

### Claude A : "Expert Planner"
- **Caractéristiques:** Comprend les dépendances, peut structurer workflows
- **Capacité:** Peut générer explicit DAG si format fourni
- **Contexte:** Sonnet 4.5, window 200K tokens, reasoning capabilities

### Claude B : "Natural Language User"
- **Caractéristiques:** Veut juste dire "read file, parse it, create issue"
- **Capacité:** N'a pas envie de penser structure explicite
- **Contexte:** Utilisateur final interagit en langage naturel

**Question critique :** AgentCards doit-il optimiser pour Claude A ou Claude B ?

---

## 🔄 User Journey Scenarios

### Scenario 1 : "Simple Parallel Read" (Cas trivial)

**User (humain) dit à Claude :**
> "Lis les fichiers config.json, package.json et README.md"

#### Option A : Explicit DAG

**Journey Claude :**

1. **Claude analyse** la requête humaine
2. **Claude identifie** : 3 reads indépendants
3. **Claude construit** structure JSON :
```json
{
  "workflow": {
    "tasks": [
      {"id": "r1", "tool": "filesystem:read", "arguments": {"path": "config.json"}, "depends_on": []},
      {"id": "r2", "tool": "filesystem:read", "arguments": {"path": "package.json"}, "depends_on": []},
      {"id": "r3", "tool": "filesystem:read", "arguments": {"path": "README.md"}, "depends_on": []}
    ]
  }
}
```
4. **Claude envoie** à AgentCards gateway
5. **AgentCards exécute** en parallèle → 3x speedup
6. **Claude reçoit** results

**💭 Cognitive Load Claude :**
- ⚠️ Doit connaître format workflow JSON
- ⚠️ Doit générer IDs uniques (r1, r2, r3)
- ⚠️ Doit spécifier depends_on (même si vide)
- ✅ Contrôle total sur séquencing

**📝 Prompt Engineering Required :**
```
You have access to AgentCards gateway. For parallel tool execution,
use this format:
{
  "workflow": {
    "tasks": [...]
  }
}
Each task needs: id, tool, arguments, depends_on array.
```

**Friction Points :**
- Format custom = Claude doit "learn" syntax
- Risk : Claude oublie format, revient à sequential calls

---

#### Option B : Auto-Detect

**Journey Claude :**

1. **Claude analyse** la requête humaine
2. **Claude fait** 3 appels MCP standard :
```json
// Call 1
{"tool": "filesystem:read", "arguments": {"path": "config.json"}}

// Call 2
{"tool": "filesystem:read", "arguments": {"path": "package.json"}}

// Call 3
{"tool": "filesystem:read", "arguments": {"path": "README.md"}}
```
3. **AgentCards détecte** : no dependencies (diff paths, no output refs)
4. **AgentCards exécute** en parallèle automatiquement
5. **Claude reçoit** results

**💭 Cognitive Load Claude :**
- ✅ Utilise format MCP natif (déjà connu)
- ✅ Aucune friction cognitive
- ✅ "Just works" - invisible optimization

**📝 Prompt Engineering Required :**
```
You have access to AgentCards gateway which automatically
parallelizes independent tool calls.
```

**Friction Points :**
- ❌ Aucun (best UX)

**🏆 Winner pour ce scenario : Option B (Auto-Detect)**

---

### Scenario 2 : "Read → Parse → Create" (Cas séquentiel)

**User dit :**
> "Lis config.json, parse-le en JSON, puis crée un GitHub issue avec les infos"

#### Option A : Explicit DAG

**Journey Claude :**

```json
{
  "workflow": {
    "tasks": [
      {
        "id": "read",
        "tool": "filesystem:read",
        "arguments": {"path": "config.json"},
        "depends_on": []
      },
      {
        "id": "parse",
        "tool": "json:parse",
        "arguments": {"jsonString": "$OUTPUT[read]"},
        "depends_on": ["read"]
      },
      {
        "id": "create",
        "tool": "github:create_issue",
        "arguments": {
          "title": "Config Update",
          "body": "$OUTPUT[parse].description"
        },
        "depends_on": ["parse"]
      }
    ]
  }
}
```

**💭 Points Clés :**
- ✅ Dependencies explicites : `depends_on: ["read"]`
- ✅ Output referencing : `$OUTPUT[read]`
- ⚠️ Template syntax custom (not MCP standard)

**Question :** Est-ce que `$OUTPUT[read]` est intuitif pour Claude ?

---

#### Option B : Auto-Detect

**Journey Claude :**

**Tentative 1 (Naïve) :**
```json
// Call 1
{"tool": "filesystem:read", "arguments": {"path": "config.json"}}

// Claude reçoit : {"content": "...json text..."}

// Call 2 - PROBLÈME : Comment passer output?
{"tool": "json:parse", "arguments": {"jsonString": "??? how to reference call 1 ???"}}
```

**❌ BLOCAGE : MCP protocol doesn't have native cross-call referencing !**

**Tentative 2 (Claude se débrouille) :**
```json
// Call 1
{"tool": "filesystem:read", "arguments": {"path": "config.json"}}

// Claude reçoit result dans sa mémoire
const fileContent = result.content;

// Call 2 - Claude passe directement la valeur
{"tool": "json:parse", "arguments": {"jsonString": fileContent}}
```

**⚠️ Problème :**
- AgentCards ne voit PAS que parse dépend de read
- Risque : AgentCards essaie de paralléliser (incorrect!)
- Actual behavior : Sequential car Claude fait call 2 après call 1

**Solution Auto-Detect :**

AgentCards doit détecter que `jsonString` argument de parse match le `content` output de read.

**Challenge :**
- Requires : Batch de calls envoyées ensemble
- MCP standard : Une call à la fois ?

**Format batch possible :**
```json
{
  "tools": [
    {"id": "t1", "name": "filesystem:read", "arguments": {"path": "config.json"}},
    {"id": "t2", "name": "json:parse", "arguments": {"jsonString": "<placeholder_t1_content>"}},
    {"id": "t3", "name": "github:create_issue", "arguments": {"body": "<placeholder_t2_description>"}}
  ]
}
```

AgentCards analyse placeholders → détecte dependencies → execute DAG

**💭 Cognitive Load Claude :**
- ⚠️ Doit utiliser placeholder syntax
- ⚠️ Batch format custom (not MCP standard)

**📊 Comparison :**

| Aspect | Option A | Option B |
|--------|----------|----------|
| Format | Custom workflow JSON | Batch + placeholders |
| Explicitness | `depends_on: ["read"]` | `<placeholder_read>` |
| Clarity | ✅ Very explicit | ⚠️ Inference required |

**🤔 Conclusion Scenario 2 :**

Les deux options nécessitent **format custom** pour sequential workflows !

MCP protocol natif = one call at a time = pas de parallelization possible.

**Winner : Option A (plus explicite et prévisible)**

---

### Scenario 3 : "Mixed Parallel + Sequential" (Cas complexe)

**User dit :**
> "Lis config.json et package.json en parallèle, puis merge les deux et crée un rapport"

**Workflow attendu :**
```
[read_config]  [read_package]
      ↓              ↓
      └──── merge ────┘
             ↓
         create_report
```

#### Option A : Explicit DAG

```json
{
  "workflow": {
    "tasks": [
      {"id": "cfg", "tool": "fs:read", "arguments": {"path": "config.json"}, "depends_on": []},
      {"id": "pkg", "tool": "fs:read", "arguments": {"path": "package.json"}, "depends_on": []},
      {
        "id": "merge",
        "tool": "json:merge",
        "arguments": {
          "obj1": "$OUTPUT[cfg]",
          "obj2": "$OUTPUT[pkg]"
        },
        "depends_on": ["cfg", "pkg"]
      },
      {
        "id": "report",
        "tool": "report:create",
        "arguments": {"data": "$OUTPUT[merge]"},
        "depends_on": ["merge"]
      }
    ]
  }
}
```

**Execution :**
1. Layer 0 : cfg + pkg → **Promise.all** (parallel)
2. Layer 1 : merge → awaits cfg+pkg
3. Layer 2 : report → awaits merge

**✅ Avantages :**
- Parfaitement clair
- Optimal parallelization
- Debuggable (see DAG structure)

---

#### Option B : Auto-Detect

**Batch request :**
```json
{
  "tools": [
    {"id": "cfg", "name": "fs:read", "arguments": {"path": "config.json"}},
    {"id": "pkg", "name": "fs:read", "arguments": {"path": "package.json"}},
    {
      "id": "merge",
      "name": "json:merge",
      "arguments": {
        "obj1": "<output_cfg>",
        "obj2": "<output_pkg>"
      }
    },
    {
      "id": "report",
      "name": "report:create",
      "arguments": {"data": "<output_merge>"}
    }
  ]
}
```

**AgentCards analysis :**
1. Parse placeholders
2. Detect : merge refs [cfg, pkg]
3. Detect : report refs [merge]
4. Build DAG : same as Option A
5. Execute with parallelization

**⚠️ Risque :**
- Placeholder parsing ambiguity
- What if "output_cfg" string appears naturally in data?

**🤔 Conclusion Scenario 3 :**

Option A plus safe, Option B potentiellement clever mais risqué.

**Winner : Option A (predictability > cleverness)**

---

## 🧠 Cognitive Load Analysis

### Pour Claude (LLM Agent)

| Task | Option A (Explicit) | Option B (Auto-Detect) |
|------|---------------------|------------------------|
| **Learn syntax** | Medium (workflow JSON) | Low (batch + placeholders) |
| **Express parallelism** | Explicit `depends_on: []` | Implicit (no placeholder) |
| **Express sequence** | Explicit `depends_on: ["id"]` | Placeholder refs |
| **Debug errors** | Clear DAG structure | Inference black box |
| **Cognitive effort** | Higher (structure) | Medium (placeholders) |

### Pour Humain (Developer)

| Task | Option A | Option B |
|------|----------|----------|
| **Read Claude output** | ✅ Très clair | ⚠️ Requires inference |
| **Debug workflows** | ✅ See DAG graph | ❌ "Why parallel?" |
| **Trust system** | ✅ Explicit = trust | ⚠️ "Did it detect correctly?" |

---

## 📊 Real-World MCP Protocol Constraints

### Investigation : MCP Spec Native Support

**Question :** Est-ce que MCP protocol supporte batch requests nativement ?

**MCP Protocol (de mémoire) :**
- `list_tools()` → Get available tools
- `call_tool(name, arguments)` → Execute one tool
- Result : `{content: [...], isError: bool}`

**❌ Pas de support batch natif dans MCP v1.0**

**Implication :**
- Option A et Option B **tous deux custom formats**
- Aucune n'est "native MCP"

**Question follow-up :**
> Comment Claude appelle-t-il actuellement plusieurs MCP tools ?

**Réponse probable :**
- Sequential : call 1, wait, call 2, wait, call 3
- Pas de parallelization actuellement
- AgentCards apporte parallelization = **new capability**

**Donc :** Les deux options sont "new behavior" pour Claude.

---

## 💡 Hybrid Insight : "Conversational DAG"

### Option C : Conversational Flow

**Idea :** Claude décrit workflow en natural language, AgentCards parse.

**Example :**
```json
{
  "workflow_description": "Read config.json and package.json in parallel, then merge them, then create a report with the merged data",
  "tools_needed": ["filesystem:read", "json:merge", "report:create"]
}
```

**AgentCards fait :**
1. Use LLM (small model) to parse description
2. Extract DAG structure via NLP
3. Execute

**✅ Avantages :**
- Natural pour Claude (et humain)
- Pas de syntax custom

**❌ Inconvénients :**
- Requires embedded LLM in gateway (heavyweight)
- Inference errors possible
- Latency overhead

**Verdict :** Overkill pour MVP, intéressant pour v2.0

---

## 🎯 Decision Framework : What Does Claude Want?

### Question 1 : Claude préfère-t-il explicit ou implicit ?

**Argument Explicit (Option A) :**
- Claude est un "planner" agent
- Sonnet 4.5+ a extended thinking
- Peut raisonner sur DAG structure
- Préfère contrôle total

**Argument Implicit (Option B) :**
- Claude veut "just work"
- Moins de cognitive load = better UX
- Inference = "smartness" perçue

**💭 Mon intuition :** Les meilleurs agents préfèrent **explicit control** quand ça compte (workflows).

---

### Question 2 : Quelle est la failure mode acceptable ?

**Option A failure :**
- Claude oublie format → Falls back to sequential
- User voit slowness
- **Degradation graceful**

**Option B failure :**
- Auto-detect wrong dependencies → Parallel execution error
- Results incorrect or out-of-order
- User sees **silent bugs**

**🚨 Winner : Option A (explicit failure > silent bugs)**

---

### Question 3 : Learning curve vs Long-term efficiency

**Option A :**
- Learn once : format workflow JSON
- Use forever : explicit, no surprises
- **Steep short curve, flat long curve**

**Option B :**
- Learn once : placeholder syntax
- Use forever : trust inference (with doubt)
- **Gentle short curve, uncertain long curve**

**📈 Winner : Option A (predictability scales better)**

---

## 🔍 Comparative User Stories

### Story A : Senior Dev avec Claude

**Context :** Dev expérimenté using Claude Code avec AgentCards

**Option A Experience :**
```
Dev: "Claude, orchestrate ce workflow : read A, read B parallèle, puis merge"

Claude: *génère workflow JSON explicit*
{
  "workflow": {
    "tasks": [
      {"id": "a", ...depends_on: []},
      {"id": "b", ...depends_on: []},
      {"id": "m", ...depends_on: ["a", "b"]}
    ]
  }
}

Dev: *voit le DAG dans logs*
"Ah, cfg+pkg parallel puis merge. Perfect."

✅ Trust établi
```

**Option B Experience :**
```
Dev: "Claude, read A, read B, puis merge"

Claude: *génère batch avec placeholders*
{tools: [...]}

AgentCards: *auto-detect, execute*

Dev: *voit results*
"Ça marche... je crois? Pourquoi cfg et pkg étaient parallel?"

⚠️ Black box feeling
```

**Préférence Senior Dev : Option A** (explicité = trust)

---

### Story B : Casual User avec Claude

**Context :** Non-dev utilisant Claude pour automation simple

**Option A Experience :**
```
User: "Claude, lis ces 3 fichiers"

Claude: *génère workflow JSON*
{workflow: {tasks: [...]}}

User: *voit JSON technique*
"Euh... je comprends pas ce JSON mais ça marche"

⚠️ Friction cognitive (mais marche)
```

**Option B Experience :**
```
User: "Claude, lis ces 3 fichiers"

Claude: *batch request simple*
{tools: [{...}, {...}, {...}]}

AgentCards: *auto-parallel*

User: *voit results*
"Nice, Claude a lu les 3 fichiers"

✅ Invisible magic
```

**Préférence Casual User : Option B** (transparence)

---

## 🎨 Design Philosophy Alignment

### AgentCards PRD Goals

**Goal 1 :** "Zero-config, zero-friction setup"
→ Favorise **Option B** (implicit)

**Goal 2 :** ">99% reliability (NFR003)"
→ Favorise **Option A** (predictable)

**Goal 3 :** "Developer Experience (DX) irréprochable"
→ Favorise **Option A** (debuggable)

**Goal 4 :** "NPS >75"
→ ??? Depends on user segment

**🤔 Conflict identified :** Zero-friction vs Reliability

---

## 🧪 Hypothesis to Validate

### H1 : Claude can learn explicit format easily

**Test :** Prompt Claude avec workflow JSON examples
**Success criteria :** Claude génère correct format 95%+ du temps
**Timeline :** 1 jour de tests

### H2 : Auto-detect works for 80% of workflows

**Test :** Analyse 100 real MCP workflow patterns
**Success criteria :** Placeholder inference correcte 80%+
**Timeline :** 2-3 jours data collection + analysis

### H3 : Users prefer explicit over implicit for critical workflows

**Test :** User interviews (5-10 power users)
**Success criteria :** 70%+ prefer explicit control
**Timeline :** 1 semaine

---

## 💡 Recommended Decision Process

### Phase 1 : Pre-Implementation (Maintenant)

**Action :** Test H1 (Can Claude learn explicit format?)

**Experiment :**
```
Prompt Claude Sonnet 4.5:
"Generate a workflow JSON for AgentCards gateway. Format:
{workflow: {tasks: [{id, tool, arguments, depends_on}]}}

Task: Read config.json, parse it, create GitHub issue"

Expected output: Valid workflow JSON
```

**Decision :**
- Si Claude réussit facilement → **Go Option A**
- Si Claude struggle → **Reconsider Option B**

---

### Phase 2 : MVP Implementation

**Recommendation :** Start **Option A** (Explicit DAG)

**Rationale :**
1. **Time-to-market :** 2-3 jours vs 1-2 semaines
2. **Reliability first :** Explicit = no silent bugs
3. **H1 probable success :** Claude can learn format
4. **Learning opportunity :** Mesurer friction réelle

**Success Metrics :**
- Claude format error rate <5%
- User complaints re: format <10%
- Parallelization speedup 3-5x (validate value prop)

---

### Phase 3 : Post-MVP Evolution

**If success (low friction, high value) :**
→ Ship v1.0 avec explicit, focus other features

**If friction élevée (>10% complaints) :**
→ Implement Option B auto-detect as optional fallback (v1.1)

**If new use case emerges :**
→ Hybrid approach (v1.2)

---

## 🎯 Final Recommendation

### For MVP (Epic 2.1-2.2)

**🏆 CHOISIR : Option A - Explicit Workflow DAG**

**Justification consolidée :**

1. **Claude UX :** Planner agents préfèrent control explicite
2. **Reliability :** Explicit failure > silent bugs (NFR003)
3. **Developer Trust :** Debuggable workflows = confiance
4. **Time-to-market :** 2-3 jours vs 1-2 semaines
5. **Validation :** Test H1 facile (1 jour)

**Trade-off accepté :**
- Cognitive load slightly higher (acceptable pour power users)
- Format custom (mais bien documenté)

**Evolution path :**
- v1.0 : Explicit ← MVP
- v1.1 : Hybrid (explicit + optional auto-detect)
- v2.0 : LLM-assisted semantic inference

---

## 📋 Next Steps

### Immediate (Pre-Implementation)

1. **Test H1 :** Prompt Claude avec workflow JSON format
2. **Document format :** README avec examples clairs
3. **Update Story 2.1 :** Simplify AC (remove schema inference)

### Sprint (Implementation)

1. **Implement :** Explicit workflow parser (100 LOC)
2. **Implement :** Topological sort + executor
3. **Test :** Benchmarks parallelization speedup

### Post-MVP (Learning)

1. **Measure :** Format error rate (Claude mistakes)
2. **Collect :** User feedback sur friction
3. **Decide :** Keep explicit vs add auto-detect

---

## 📎 Appendix : Prompt Engineering Examples

### Example 1 : Simple Parallel

**User to Claude :**
"Read these 3 files: config.json, package.json, README.md"

**Claude Prompt (avec AgentCards) :**
```
You have access to AgentCards gateway for parallel tool execution.

Format for parallel/sequential workflows:
{
  "workflow": {
    "tasks": [
      {
        "id": "unique_id",
        "tool": "tool_name",
        "arguments": {...},
        "depends_on": ["id1", "id2"]  // Empty array = no dependencies
      }
    ]
  }
}

Output referencing: Use $OUTPUT[task_id] to reference previous task outputs.

Example - Parallel reads:
{
  "workflow": {
    "tasks": [
      {"id": "r1", "tool": "filesystem:read", "arguments": {"path": "a.txt"}, "depends_on": []},
      {"id": "r2", "tool": "filesystem:read", "arguments": {"path": "b.txt"}, "depends_on": []}
    ]
  }
}

Now generate workflow for: {user_request}
```

**Expected Claude Output :**
```json
{
  "workflow": {
    "tasks": [
      {"id": "cfg", "tool": "filesystem:read", "arguments": {"path": "config.json"}, "depends_on": []},
      {"id": "pkg", "tool": "filesystem:read", "arguments": {"path": "package.json"}, "depends_on": []},
      {"id": "readme", "tool": "filesystem:read", "arguments": {"path": "README.md"}, "depends_on": []}
    ]
  }
}
```

**Result :** 3x parallelization ⚡

---

**Status :** 🟢 DECISION PENDING USER VALIDATION
**Decision Owner :** BMad + Team
**Timeline :** Decide avant Story 2.1 implementation
