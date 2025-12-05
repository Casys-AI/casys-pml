# AgentCards - Epic Breakdown

**Author:** BMad
**Date:** 2025-11-03 (Updated: 2025-12-05)
**Project Level:** 3
**Target Scale:** 10 epics, 50+ stories total

---

## Overview

Ce document fournit le breakdown des epics **actifs** pour AgentCards.

**Completed Epics (1-6):** Archivés dans [docs/archive/completed-epics-1-6.md](./archive/completed-epics-1-6.md)

**Active Epics:**
- **Epic 7:** Emergent Capabilities & Learning System (IN PROGRESS)
- **Epic 8:** Hypergraph Capabilities Visualization (BACKLOG)

---

## Completed Epics Summary

| Epic | Title | Status | Key Deliverables |
|------|-------|--------|------------------|
| 1 | Project Foundation & Context Optimization | ✅ DONE | PGlite + pgvector, semantic search, context <5% |
| 2 | DAG Execution & Production Readiness | ✅ DONE | Parallel execution, MCP gateway, 3-5x speedup |
| 2.5 | Adaptive DAG Feedback Loops | ✅ DONE | AIL/HIL, checkpoint/resume, command queue |
| 3 | Agent Code Execution & Local Processing | ✅ DONE | Deno sandbox, execute_code tool, PII protection |
| 3.5 | Speculative Execution with Sandbox | ✅ DONE | 0ms perceived latency, safe rollback |
| 4 | Episodic Memory & Adaptive Learning | ✅ DONE | Threshold persistence, context-aware suggestions |
| 5 | Intelligent Tool Discovery | ✅ DONE | Hybrid search (semantic + Adamic-Adar), templates |
| 6 | Real-time Graph Monitoring | ✅ DONE | SSE events, Cytoscape dashboard, live metrics |

> **Full details:** See [completed-epics-1-6.md](./archive/completed-epics-1-6.md)

---

## Epic 7: Emergent Capabilities & Learning System

> **ADRs:** ADR-027 (Execute Code Graph Learning), ADR-028 (Emergent Capabilities System), ADR-032 (Sandbox Worker RPC Bridge)
> **Research:** docs/research/research-technical-2025-12-03.md
> **Status:** In Progress (Story 7.1 done, Story 7.1b planned)

**Expanded Goal (2-3 sentences):**

Transformer AgentCards en système où les capabilities **émergent de l'usage** plutôt que d'être pré-définies. Implémenter un paradigme où Claude devient un **orchestrateur de haut niveau** qui délègue l'exécution à AgentCards, récupérant des capabilities apprises et des suggestions proactives. Ce système apprend continuellement des patterns d'exécution pour cristalliser des capabilities réutilisables, offrant une différenciation unique par rapport aux solutions concurrentes (Docker Dynamic MCP, Anthropic Programmatic Tool Calling).

**Value Delivery:**

À la fin de cet epic, AgentCards:
- **Track** les tools réellement appelés via Worker RPC Bridge (native tracing)
- **Apprend** des patterns d'exécution et les cristallise en capabilities
- **Suggère** proactivement des capabilities et tools pertinents
- **Réutilise** le code prouvé (skip génération Claude ~2-5s)
- **S'améliore** continuellement avec chaque exécution

**Architecture 3 Couches (ADR-032 - Worker RPC Bridge):**

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1: ORCHESTRATION (Claude)                                 │
│  • Reçoit l'intent utilisateur                                   │
│  • Query: "Capability existante?" → YES: execute cached          │
│  • NO: génère code → execute → learn                             │
│  • NE VOIT PAS: données brutes, traces, détails exécution        │
└─────────────────────────────────────────────────────────────────┘
                          ▲ IPC: result + suggestions
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 2: CAPABILITY ENGINE + RPC BRIDGE                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │ Capability   │  │   Worker     │  │  Suggestion  │           │
│  │   Matcher    │  │   Bridge     │  │    Engine    │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
│         │                 │                  │                   │
│         │     Native Tracing (ALL calls)     │                   │
│         └─────────────────┼──────────────────┘                   │
│              GraphRAG (PageRank, Louvain, Adamic-Adar)          │
└─────────────────────────────────────────────────────────────────┘
                          ▲ postMessage RPC (tool calls)
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 3: EXECUTION (Deno Worker, permissions: "none")           │
│  • Tool proxies: mcp.server.tool() → RPC to bridge               │
│  • Capabilities: inline functions (Option B - no RPC overhead)   │
│  • Isolation complète, pas de discovery runtime                  │
└─────────────────────────────────────────────────────────────────┘
```

**Estimation:** 5 stories, ~2-3 semaines

---

### Story Breakdown - Epic 7

**Story 7.1: IPC Tracking - Tool Usage Capture** ⚠️ SUPERSEDED

> **Status:** Done (2025-12-05) - BUT approach superseded by Story 7.1b
>
> **Hidden Bug Discovered:** `wrapMCPClient()` from Story 3.2 **never actually worked** with the subprocess sandbox:
> ```typescript
> // context-builder.ts:148 - Creates functions
> const toolContext = wrapMCPClient(client, tools);
> // executor.ts:356 - Serializes for subprocess
> return `const ${key} = ${JSON.stringify(value)};`;
> // JSON.stringify(function) → undefined! Tools silently disappear.
> ```
> **Why never caught:** Tests used mock data, no integration test called real MCP tools from sandbox.
>
> **Solution:** Story 7.1b implements Worker RPC Bridge (ADR-032) which solves both problems:
> 1. Tool proxies instead of serialized functions (actually works!)
> 2. Native tracing in the bridge (no stdout parsing)
>
> **What to keep from 7.1:**
> - The trace event types (tool_start, tool_end)
> - The GraphRAG integration (updateFromExecution)
> - The test patterns
>
> **What to remove (Story 7.1b cleanup):**
> - `wrapMCPClient()` in context-builder.ts (broken, never worked)
> - `wrapToolCall()` in context-builder.ts
> - `parseTraces()` in gateway-server.ts
> - `rawStdout` in ExecutionResult

---

**Story 7.1b: Worker RPC Bridge - Native Tracing (ADR-032)**

As a system executing code with MCP tools,
I want a Worker-based sandbox with RPC bridge for tool calls,
So that MCP tools work in sandbox AND all calls are traced natively without stdout parsing.

**Why this replaces Story 7.1:**
- MCP client functions cannot be JSON.stringify'd to subprocess
- `__TRACE__` stdout parsing is fragile (collision with user console.log)
- Native bridge tracing is 100% reliable and simpler

**Architecture:**
```
Main Process                          Worker (permissions: "none")
┌─────────────────┐                  ┌─────────────────────────────┐
│ MCPClients      │                  │ const mcp = {               │
│ WorkerBridge    │◄─── postMessage ─│   fs: { read: (a) =>        │
│   - traces[]    │                  │     __rpcCall("fs","read",a)│
│   - callTool()  │─── postMessage ──►│   }                        │
│                 │                  │ };                          │
└─────────────────┘                  │ // User code runs here      │
                                     └─────────────────────────────┘
```

**Acceptance Criteria:**
1. `WorkerBridge` class créée (`src/sandbox/worker-bridge.ts`)
   - Spawns Deno Worker with `permissions: "none"`
   - Handles RPC messages (rpc_call → rpc_result)
   - Routes tool calls to MCPClients
   - **Native tracing:** captures tool_start/tool_end in bridge
2. `SandboxWorker` script (`src/sandbox/sandbox-worker.ts`)
   - Receives tool definitions (not functions!)
   - Generates tool proxies: `mcp.server.tool(args) → __rpcCall(...)`
   - Executes user code with proxies available
3. RPC Message Types added to `src/sandbox/types.ts`:
   ```typescript
   interface RPCCallMessage { type: "rpc_call"; id: string; server: string; tool: string; args: unknown }
   interface RPCResultMessage { type: "rpc_result"; id: string; success: boolean; result?: unknown; error?: string }
   ```
4. `DenoSandboxExecutor` extended avec mode Worker (alongside existing subprocess)
5. Tracing: ALL tool calls traced in bridge with `{ tool, duration_ms, success }`
6. GraphRAG: `updateFromExecution()` called with traced tools
7. Tests: execute code calling 2 MCP tools → verify both traced → edges created
8. Performance: RPC overhead < 10ms per call
9. **Cleanup:** Remove Story 7.1 code (wrapToolCall, parseTraces, rawStdout)

**Files to Create:**
- `src/sandbox/worker-bridge.ts` (~150 LOC)
- `src/sandbox/sandbox-worker.ts` (~100 LOC)

**Files to Modify:**
- `src/sandbox/types.ts` - Add RPC message types (~30 LOC)
- `src/sandbox/executor.ts` - Add Worker mode (~30 LOC)
- `src/sandbox/context-builder.ts` - Add `buildToolDefinitions()` (~20 LOC)
- `src/mcp/gateway-server.ts` - Remove parseTraces(), use bridge traces (~-40 LOC)

**Files to Delete (Cleanup):**
- `tests/unit/mcp/trace_parsing_test.ts`
- `tests/unit/sandbox/tracing_performance_test.ts`

**Prerequisites:** Epic 3 (Sandbox operational), ADR-032 approved

**Estimation:** 2-3 jours (~350 LOC net)

---

**Story 7.2a: Capability Storage - Migration & Eager Learning**

As a system persisting learned patterns,
I want to store capabilities immediately after first successful execution,
So that learning happens instantly without waiting for repeated patterns.

**Philosophy: Eager Learning**
- Storage dès la 1ère exécution réussie (pas d'attente de 3+)
- ON CONFLICT → UPDATE usage_count++ (deduplication par code_hash)
- Storage is cheap (~2KB/capability), on garde tout
- Le filtrage se fait au moment des suggestions, pas du stockage

**Acceptance Criteria:**
1. Migration 011 créée: extension table `workflow_pattern`
   - `code_snippet TEXT` - Le code exécuté
   - `parameters_schema JSONB` - Schema JSON des paramètres (nullable, rempli par Story 7.2b)
   - `cache_config JSONB` - Configuration cache (ttl, cacheable)
   - `name TEXT` - Nom auto-généré ou manuel
   - `description TEXT` - Description de la capability
   - `success_rate REAL` - Taux de succès (0-1)
   - `avg_duration_ms INTEGER` - Durée moyenne
   - `created_at TIMESTAMPTZ` - Date de création (1ère exec)
   - `last_used TIMESTAMPTZ` - Dernière utilisation
   - `source TEXT` - 'emergent' ou 'manual'
2. Extension table `workflow_execution` avec `code_snippet TEXT`, `code_hash TEXT`
3. **Eager insert:** Après chaque exec réussie avec intent:
   ```sql
   INSERT INTO workflow_pattern (code_hash, code_snippet, intent_embedding, ...)
   ON CONFLICT (code_hash) DO UPDATE SET
     usage_count = usage_count + 1,
     last_used = NOW(),
     success_rate = (success_count + 1) / (usage_count + 1)
   ```
4. Index HNSW sur `intent_embedding` pour recherche rapide
5. Index sur `code_hash` pour upsert rapide
6. Tests: exec 1x → verify capability créée → exec 2x même code → verify usage_count = 2
7. Migration idempotente (peut être rejouée)

**Prerequisites:** Story 7.1b (Worker RPC Bridge with tracing operational)

**Estimation:** 1-2 jours

---

**Story 7.2b: Schema Inference (ts-morph + Zod)**

As a system exposing capability interfaces,
I want to automatically infer parameter schemas from TypeScript code,
So that Claude knows what arguments to pass when calling capabilities.

**Stack (Deno compatible ✅):**
- `ts-morph` via `deno.land/x/ts_morph@22.0.0` ou JSR `@ts-morph/ts-morph`
- `zod` via `npm:zod` ou `deno.land/x/zod` ou JSR natif
- `zod-to-json-schema` via `npm:zod-to-json-schema`

> Note: ts-morph analyse du TS simple (pas d'imports Deno exotiques) - OK pour notre code généré.

**Acceptance Criteria:**
1. `SchemaInferrer` class créée (`src/capabilities/schema-inferrer.ts`)
2. Method `inferSchema(code: string, mcpSchemas: Map<string, JSONSchema>)` → JSONSchema
3. Flow d'inférence:
   ```typescript
   // 1. ts-morph parse AST → trouve args.filePath, args.debug
   // 2. Inférer types depuis MCP schemas (args.filePath → fs.read.path → string)
   // 3. Générer Zod schema → z.object({ filePath: z.string(), ... })
   // 4. Convertir en JSON Schema pour stockage DB
   ```
4. Détection `args.xxx` via AST traversal (PropertyAccessExpression)
5. Inférence de type depuis les MCP schemas quand possible
6. Fallback à `unknown` si type non-inférable
7. Génération de Zod schema avec `z.object({...})`
8. Conversion vers JSON Schema via `zod-to-json-schema`
9. Update `workflow_pattern.parameters_schema` après inférence
10. Tests: code avec `args.filePath` utilisé dans `fs.read()` → schema.filePath = string
11. Tests: code avec `args.unknown` non-mappable → schema.unknown = unknown

**Prerequisites:** Story 7.2a (storage ready)

**Estimation:** 2-3 jours

---

**Story 7.3a: Capability Matching & search_capabilities Tool**

As an AI agent,
I want to search for existing capabilities matching my intent,
So that I can discover and reuse proven code.

**Integration avec Adaptive Thresholds (Epic 4):**
- Réutilise `AdaptiveThresholdManager` existant
- Nouveau context type: `capability_matching`
- Seuil initial: `suggestionThreshold` (0.70 par défaut)
- Auto-ajustement basé sur FP (capability échoue) / FN (user génère nouveau code alors que capability existait)

**Acceptance Criteria:**
1. `CapabilityMatcher` class créée (`src/capabilities/matcher.ts`)
2. Constructor prend `AdaptiveThresholdManager` en injection
3. Method `findMatch(intent)` → Capability | null
   - Threshold = `adaptiveThresholds.getThresholds().suggestionThreshold`
   - Pas de threshold hardcodé!
4. Vector search sur `workflow_pattern.intent_embedding`
5. Nouveau tool MCP `agentcards:search_capabilities` exposé
6. Input schema: `{ intent: string, include_suggestions?: boolean }`
   - Pas de threshold en param - géré par adaptive system
7. Output: `{ capabilities: Capability[], suggestions?: Suggestion[], threshold_used: number, parameters_schema: JSONSchema }`
8. Feedback loop: après exécution capability, appeler `adaptiveThresholds.recordExecution()`
9. Stats update: `usage_count++`, recalc `success_rate` après exécution
10. Tests: créer capability → search by similar intent → verify match uses adaptive threshold

**Prerequisites:** Story 7.2b (schema inference ready), Epic 4 (AdaptiveThresholdManager)

**Estimation:** 1-2 jours

---

**Story 7.3b: Capability Injection - Inline Functions (Option B)**

As a code executor,
I want capabilities injected as inline functions in the Worker context,
So that code can call capabilities with zero RPC overhead and proper tracing.

**Architecture Decision: Option B (Inline Functions)**

> **Why Option B instead of RPC for capabilities?**
> - **No RPC overhead** for capability → capability calls (direct function call)
> - **Simpler** - capabilities are just functions in the same Worker context
> - **MCP tool calls** still go through RPC bridge (and get traced there natively)
>
> | Call Type | Mechanism | Tracing Location |
> |-----------|-----------|------------------|
> | Code → MCP tool | RPC to bridge | ✅ Bridge (native) |
> | Code → Capability | Direct function call | ✅ Worker (wrapper) |
> | Capability → MCP tool | RPC to bridge | ✅ Bridge (native) |
> | Capability → Capability | Direct function call | ✅ Worker (wrapper) |

**How it works with Story 7.1b Worker RPC Bridge:**

```typescript
// In Worker context - generated by WorkerBridge
const mcp = {
  kubernetes: { deploy: (args) => __rpcCall("kubernetes", "deploy", args) },
  slack: { notify: (args) => __rpcCall("slack", "notify", args) }
};

// Capabilities are INLINE functions (not RPC)
const capabilities = {
  runTests: async (args) => {
    __trace({ type: "capability_start", name: "runTests" });
    const result = await mcp.jest.run({ path: args.path }); // RPC → traced in bridge
    __trace({ type: "capability_end", name: "runTests", success: true });
    return result;
  },
  deployProd: async (args) => {
    __trace({ type: "capability_start", name: "deployProd" });
    await capabilities.runTests({ path: "./tests" }); // Direct call → traced above
    await mcp.kubernetes.deploy({ image: args.image }); // RPC → traced in bridge
    __trace({ type: "capability_end", name: "deployProd", success: true });
    return { deployed: true };
  }
};

// User code has access to both
await capabilities.deployProd({ image: "app:v1.0" });
```

**Acceptance Criteria:**
1. `CapabilityCodeGenerator` class créée (`src/capabilities/code-generator.ts`)
   - Generates inline function code from capability `code_snippet`
   - Wraps each function with `__trace()` calls for capability_start/end
   - Returns string to inject into Worker context
2. `WorkerBridge.buildCapabilityContext()` method added
   - Takes list of relevant capabilities (from CapabilityMatcher)
   - Calls `CapabilityCodeGenerator` to build inline code
   - Injects alongside tool proxies in Worker
3. Worker `__trace()` function collects events in array
   - At execution end, Worker sends traces via postMessage
   - Bridge merges capability traces with tool traces
4. **Learning loop - Capability Graph:**
   - Edges créés entre capabilities qui s'appellent (from traces)
   - `updateFromExecution()` receives both tool and capability traces
   - GraphRAG stores capability→capability edges
5. Tests: capability A calls capability B → both traced → edge A→B in graph
6. Tests: capability calls MCP tool → tool traced in bridge, capability traced in worker
7. Tests: nested capabilities (A → B → C) → all 3 traced with correct parent/child
8. Performance: capability→capability call < 1ms (no RPC)

**Files to Create:**
- `src/capabilities/code-generator.ts` (~80 LOC)

**Files to Modify:**
- `src/sandbox/worker-bridge.ts` - Add `buildCapabilityContext()` (~40 LOC)
- `src/sandbox/sandbox-worker.ts` - Add `__trace()` function, collect traces (~20 LOC)

**Prerequisites:** Story 7.1b (Worker RPC Bridge), Story 7.3a (CapabilityMatcher)

**Estimation:** 1.5-2 jours (~140 LOC)

---

### Note Architecturale: Worker Context & Capability Layers (ADR-032)

Avec le Worker RPC Bridge (Story 7.1b), le Worker a accès à deux types de fonctions :

```typescript
// Worker context - generated by WorkerBridge

// 1. MCP Tools: Proxies that call bridge via RPC (traced in bridge)
const mcp = {
  github: { createIssue: (args) => __rpcCall("github", "createIssue", args) },
  filesystem: { read: (args) => __rpcCall("filesystem", "read", args) },
  kubernetes: { deploy: (args) => __rpcCall("kubernetes", "deploy", args) }
};

// 2. Capabilities: Inline functions (traced in worker via __trace())
const capabilities = {
  parseConfig: async (args) => {
    __trace({ type: "capability_start", name: "parseConfig" });
    const content = await mcp.filesystem.read({ path: args.path }); // RPC
    const parsed = JSON.parse(content);
    __trace({ type: "capability_end", name: "parseConfig", success: true });
    return parsed;
  },
  deployProd: async (args) => {
    __trace({ type: "capability_start", name: "deployProd" });
    await capabilities.runTests({ path: "./tests" });   // Direct call (no RPC)
    await capabilities.buildDocker({ tag: "v1.0" });    // Direct call (no RPC)
    await mcp.kubernetes.deploy({ image: "app:v1.0" }); // RPC
    __trace({ type: "capability_end", name: "deployProd", success: true });
  }
};
```

**Key Benefits of Option B:**
- **Zero overhead** for capability → capability calls (direct function call)
- **Unified tracing** - bridge traces MCP tools, worker traces capabilities
- **Simple architecture** - no complex RPC routing for capabilities

**Limites à considérer (future story si besoin):**
- Profondeur max de récursion (3 niveaux?)
- Détection de cycles (A → B → A)
- Call stack dans traces (parent_trace_id)

---

**Story 7.4: Suggestion Engine & Proactive Recommendations (Lazy Suggestions)**

As an AI agent,
I want proactive suggestions based on current context,
So that I can discover relevant capabilities and tools without searching.

**Philosophy: Lazy Suggestions**
- On a TOUT stocké (eager learning), mais on ne suggère PAS tout
- Seuil adaptatif: utilise `AdaptiveThresholdManager.getThresholds().suggestionThreshold`
- Score combiné: `(success_rate × 0.6) + (normalized_usage × 0.4)`
- Capability suggérée si `combined_score >= suggestionThreshold`

**Integration avec Adaptive Thresholds (Epic 4):**
- Réutilise `AdaptiveThresholdManager` existant
- Feedback: si user ignore suggestion → FN, si user utilise → TP
- Seuil s'ajuste automatiquement au fil du temps

**Acceptance Criteria:**
1. `SuggestionEngine` class créée (`src/capabilities/suggestion-engine.ts`)
2. Constructor prend `AdaptiveThresholdManager` en injection
3. Method `suggest(contextTools: string[])` → Suggestion[]
4. Suggestion types: `capability`, `tool`, `next_tool`
5. **Lazy filter (adaptatif):**
   ```typescript
   const threshold = adaptiveThresholds.getThresholds().suggestionThreshold;
   const score = (cap.success_rate * 0.6) + (normalizedUsage * 0.4);
   return score >= threshold;
   ```
6. Algorithms utilisés:
   - Louvain communities: capabilities de la même community
   - Adamic-Adar: tools related au context actuel
   - Out-neighbors: "next likely tool" basé sur dernier tool
7. Confidence scoring: score combiné retourné avec chaque suggestion
8. Suggestions incluses dans response `execute_code` si demandé
9. Max 5 suggestions retournées, triées par score
10. Feedback loop: track si user utilise/ignore suggestions
11. Tests: verify threshold adaptatif utilisé, pas de valeur hardcodée

**Prerequisites:** Story 7.3b (capability injection)

**Estimation:** 2-3 jours

---

**Story 7.5a: Capability Result Cache**

As a system optimizing for performance,
I want cached capability results,
So that repeat executions are instant.

**Acceptance Criteria:**
1. Cache multi-niveaux implémenté:
   - **Level 1:** Execution cache (existant) - hash(code + context)
   - **Level 2:** Capability result cache - capability_id + params_hash
   - **Level 3:** Intent similarity cache (optional) - embedding similarity > 0.95
2. Table `capability_cache` créée:
   ```sql
   CREATE TABLE capability_cache (
     capability_id UUID REFERENCES workflow_pattern(id),
     params_hash TEXT,
     result JSONB,
     created_at TIMESTAMPTZ,
     expires_at TIMESTAMPTZ,
     PRIMARY KEY (capability_id, params_hash)
   )
   ```
3. Cache lookup avant exécution: `findCachedResult(capability_id, params)`
4. Cache write après exécution réussie
5. Invalidation triggers:
   - Tool schema change → invalidate capabilities using this tool
   - 3+ failures consécutifs → invalidate capability cache
   - Manual: `DELETE FROM capability_cache WHERE capability_id = ?`
6. Tests: exec capability → verify cache hit on 2nd call → verify result identical
7. Metrics: `cache_hit_rate`
8. Config: `CAPABILITY_CACHE_TTL` (default: 1 hour)

**Prerequisites:** Story 7.4 (suggestion engine)

**Estimation:** 1-2 jours

---

**Story 7.5b: Capability Pruning (Optional)**

As a system managing storage,
I want periodic cleanup of unused capabilities,
So that storage stays clean.

**Note:** Cette story est optionnelle. Avec eager learning, on stocke tout.
Le pruning peut être activé si le stockage devient un problème.

**Acceptance Criteria:**
1. Pruning job configurable (cron ou trigger manuel)
2. Pruning query:
   ```sql
   DELETE FROM workflow_pattern
   WHERE usage_count = 1
     AND last_used < NOW() - INTERVAL '30 days'
     AND source = 'emergent'  -- Never prune manual capabilities
   ```
3. Pruning désactivé par défaut: `PRUNING_ENABLED` (default: false)
4. Dry-run mode: `prune(dryRun: true)` → returns count without deleting
5. Logs: "Pruned N capabilities older than 30 days with usage_count=1"
6. Tests: create old capability → run pruning → verify deleted
7. Metrics: `capabilities_pruned_total`

**Prerequisites:** Story 7.5a (cache ready)

**Estimation:** 0.5-1 jour

---

### Epic 7 Capability Lifecycle (Eager Learning)

```
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 1: EXECUTE & LEARN (Eager - dès exec 1)                  │
├─────────────────────────────────────────────────────────────────┤
│  Intent → VectorSearch → Tools → Execute → Track via IPC       │
│  → Success? UPSERT workflow_pattern immédiatement               │
│  → ON CONFLICT: usage_count++, update success_rate              │
│  → Capability discoverable IMMÉDIATEMENT                        │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 2: CAPABILITY MATCHING                                    │
├─────────────────────────────────────────────────────────────────┤
│  Intent → CapabilityMatcher.findMatch() → MATCH (score > 0.85) │
│  → Filter: success_rate > 0.7 (quality gate)                   │
│  → Cache hit? Return cached result                              │
│  → Cache miss? Execute code_snippet → cache result              │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 3: LAZY SUGGESTIONS                                       │
├─────────────────────────────────────────────────────────────────┤
│  SuggestionEngine.suggest(context) avec filtres:                │
│  → usage_count >= 2 (validé par répétition)                    │
│  → OU success_rate > 0.9 (validé par qualité)                  │
│  → Évite de suggérer les one-shots non validés                 │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 4: OPTIONAL PRUNING (background, désactivé par défaut)   │
├─────────────────────────────────────────────────────────────────┤
│  DELETE WHERE usage_count = 1 AND last_used < 30 days ago      │
│  → Nettoie les capabilities jamais réutilisées                  │
│  → Configurable: PRUNING_ENABLED=true                           │
└─────────────────────────────────────────────────────────────────┘
```

**Différence clé vs approche "3+ exécutions":**
- ❌ Ancien: Attendre 3 exécutions → Pattern detection → Promotion
- ✅ Nouveau: 1 exécution réussie → Capability créée → Filtrage au moment des suggestions

---

### Epic 7 Market Comparison

| Feature | Docker Dynamic MCP | Anthropic PTC | **AgentCards Epic 7** |
|---------|-------------------|---------------|----------------------|
| **Discovery** | Runtime | Pre-config | Pre-exec + Capability Match |
| **Learning** | ❌ None | ❌ None | ✅ GraphRAG + Capabilities |
| **Suggestions** | ❌ None | ❌ None | ✅ Louvain + Adamic-Adar |
| **Code Reuse** | ❌ None | ❌ None | ✅ Capability cache |
| **Recursion Risk** | ⚠️ Possible | N/A | ❌ Impossible (scope fixe) |
| **Security** | Container | Sandbox | Sandbox + scope fixe |

**Différenciateur clé:**
> "AgentCards apprend de chaque exécution et suggère des capabilities optimisées - comme un pair-programmer qui se souvient de tout."

---

## Epic 8: Hypergraph Capabilities Visualization

> **ADR:** ADR-029 (Hypergraph Capabilities Visualization)
> **Depends on:** Epic 6 (Dashboard), Epic 7 (Capabilities Storage)
> **Status:** Proposed (2025-12-04)

**Expanded Goal (2-3 sentences):**

Visualiser les capabilities comme **hyperedges** (relations N-aires entre tools) via Cytoscape.js compound graphs, permettant aux utilisateurs de voir, explorer et réutiliser le code appris par le système. Une capability n'est pas une relation binaire mais une relation N-aire connectant plusieurs tools ensemble, nécessitant une approche de visualisation différente du graph classique.

**Value Delivery:**

À la fin de cet epic, un développeur peut:
- Voir visuellement quelles capabilities ont été apprises par le système
- Explorer les relations hypergraph entre tools et capabilities
- Visualiser le code_snippet de chaque capability avec syntax highlighting
- Copier et réutiliser le code prouvé directement depuis le dashboard
- Filtrer et rechercher les capabilities par intent, success_rate, usage

**Décision Architecturale (ADR-029):** Cytoscape.js Compound Graphs
- Capability = parent node (violet, expandable)
- Tools = child nodes (colored by server)
- Click capability → Code Panel avec syntax highlighting
- Toggle button: [Tools] [Capabilities] [Hypergraph]

**Estimation:** 5 stories, ~1-2 semaines

---

### Story Breakdown - Epic 8

**Story 8.1: Capability Data API**

As a dashboard developer,
I want API endpoints to fetch capabilities and hypergraph data,
So that the frontend can visualize the learned capabilities.

**Acceptance Criteria:**
1. Endpoint `GET /api/capabilities` créé
   - Response: `{ capabilities: Capability[], total: number }`
   - Capability includes: id, name, description, code_snippet, tools_used[], success_rate, usage_count, community_id
2. Query parameters supportés:
   - `?community_id=N` - Filter by Louvain community
   - `?min_success_rate=0.7` - Filter by quality
   - `?min_usage=2` - Filter by usage
   - `?limit=50&offset=0` - Pagination
3. Endpoint `GET /api/graph/hypergraph` créé
   - Response: `{ nodes: CytoscapeNode[], edges: CytoscapeEdge[], capabilities_count, tools_count }`
   - Nodes include both tools and capabilities with `type` field
4. Join sur `workflow_pattern` et `tool_schemas` pour récupérer metadata
5. Intent preview: premiers 100 caractères de l'intent embedding description
6. Tests HTTP: verify JSON structure, filters work correctly
7. OpenAPI documentation for both endpoints

**Prerequisites:** Epic 7 Story 7.2 (workflow_pattern table with code_snippet)

---

**Story 8.2: Compound Graph Builder**

As a system architect,
I want a HypergraphBuilder class that converts capabilities to Cytoscape compound nodes,
So that the visualization can represent N-ary relationships correctly.

**Acceptance Criteria:**
1. `HypergraphBuilder` class créée (`src/visualization/hypergraph-builder.ts`)
2. Method `buildCompoundGraph(capabilities: Capability[], tools: Tool[])` → CytoscapeElements
3. Capability node structure:
   ```javascript
   {
     data: {
       id: 'cap-uuid-1',
       type: 'capability',
       label: 'Create Issue from File',
       code_snippet: 'await mcp.github...',
       success_rate: 0.95,
       usage_count: 12
     }
   }
   ```
4. Tool child node structure:
   ```javascript
   {
     data: {
       id: 'filesystem:read',
       parent: 'cap-uuid-1',  // Links to capability
       type: 'tool',
       server: 'filesystem'
     }
   }
   ```
5. Handle tools belonging to multiple capabilities (create separate instances with unique IDs)
6. Edge creation between tools within same capability (optional, can be toggled)
7. Include edges between capabilities if they share tools (cross-capability links)
8. Unit tests: verify compound structure correct for various capability configurations

**Prerequisites:** Story 8.1 (API endpoints ready)

---

**Story 8.3: Hypergraph View Mode**

As a power user,
I want a "Hypergraph" view mode in the dashboard,
So that I can visualize capabilities as compound nodes containing their tools.

> **IMPORTANT:** Cette story DOIT intégrer le mode hypergraph dans le dashboard EXISTANT (Epic 6).
> Pas de nouvelle page - c'est un toggle de vue dans le même dashboard.
> **Requiert:** Consultation avec UX Designer agent avant implémentation pour valider l'intégration UI.

**Acceptance Criteria:**
1. Toggle button group in dashboard header: `[Tools] [Capabilities] [Hypergraph]`
   - **Intégration:** Utilise le header existant du dashboard Epic 6
   - **Transition:** Smooth animation entre les vues, même container graph
2. Hypergraph view uses `fcose` or `cola` layout (compound-aware)
3. Capability node styling:
   - Background: violet/purple (`#8b5cf6`)
   - Border: rounded rectangle
   - Label: capability name or intent preview
   - Expandable: click to show/hide children
4. Tool node styling: same as existing (colored by server)
5. Layout options:
   - Expand all capabilities (default)
   - Collapse all (show only capability nodes)
   - Mixed (user can expand/collapse individually)
6. Performance: render <500ms for 50 capabilities, 200 tools
7. Smooth transitions between view modes
8. Persist view mode preference in localStorage
9. Mobile responsive (optional, nice-to-have)

**Prerequisites:** Story 8.2 (HypergraphBuilder ready)

**UX Design Considerations (à valider avec UX Designer):**
- Comment cohabitent les 3 vues dans le même espace?
- Le graph container reste le même, seules les données changent
- Les filtres existants (Epic 6) s'appliquent-ils au mode Hypergraph?
- Position du Code Panel: sidebar droite ou modal?

---

**Story 8.4: Code Panel Integration**

As a developer,
I want to see the code_snippet when I click on a capability,
So that I can understand what the capability does and copy the code.

**Acceptance Criteria:**
1. Code Panel component créé (sidebar or modal)
2. Appears on capability node click
3. Syntax highlighting using Prism.js or highlight.js (TypeScript syntax)
4. Code panel contents:
   - Capability name (editable if manual)
   - Intent/description
   - `code_snippet` with syntax highlighting
   - Stats: success_rate %, usage_count, last_used date
   - Tools used: list with server icons
5. Actions:
   - "Copy Code" button → clipboard with toast notification
   - "Try This" button → opens capability in execute_code context (future)
   - "Edit Name" → allows user to rename capability
6. Keyboard shortcuts:
   - `Esc` to close panel
   - `Cmd/Ctrl+C` to copy code when panel focused
7. Dark mode support (match dashboard theme)
8. Responsive: panel doesn't overflow on small screens

**Prerequisites:** Story 8.3 (Hypergraph view mode)

---

**Story 8.5: Capability Explorer**

As a user looking for reusable capabilities,
I want to search and filter capabilities,
So that I can find relevant code patterns quickly.

**Acceptance Criteria:**
1. Search bar in Hypergraph view: search by name, description, or intent
2. Autocomplete suggestions while typing
3. Filter controls:
   - Success rate slider: 0% - 100%
   - Minimum usage count input
   - Community dropdown (Louvain clusters)
   - Date range: capabilities created/used in last X days
4. Sort options:
   - By usage_count (most used first)
   - By success_rate (highest quality first)
   - By last_used (recent first)
   - By created_at (newest first)
5. Results highlight:
   - Matching capabilities highlighted in graph
   - Non-matching capabilities dimmed (0.3 opacity)
6. "Try This Capability" action:
   - Pre-fills `execute_code` with capability code
   - Opens in new conversation or copies to clipboard
7. Export capabilities:
   - "Export Selected" → JSON file with code_snippets
   - "Export All" → Full capability dump
8. Bulk actions (optional):
   - Delete unused capabilities
   - Merge similar capabilities
9. Keyboard navigation: arrow keys to navigate results

**Prerequisites:** Story 8.4 (Code Panel working)

---

### Epic 8 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  PGlite                                                         │
│  ┌─────────────────┐      ┌─────────────────────┐              │
│  │ workflow_pattern│      │  tool_schemas       │              │
│  │ - code_snippet  │      │  - tool_id          │              │
│  │ - tools_used[]  │      │  - server           │              │
│  │ - intent_embed  │      │                     │              │
│  └────────┬────────┘      └──────────┬──────────┘              │
└───────────┼─────────────────────────┼───────────────────────────┘
            │                          │
            ▼                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  HypergraphBuilder                                              │
│  - buildCompoundGraph(capabilities, tools)                      │
│  - Returns Cytoscape elements with parent relationships         │
└────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Cytoscape.js (existing dashboard)                              │
│  - Compound layout (cola, dagre, or fcose)                     │
│  - Capability nodes: violet, expandable                        │
│  - Tool nodes: colored by server (existing)                    │
│  - Click capability → CodePanel with syntax highlighting       │
└─────────────────────────────────────────────────────────────────┘
```

---

### Epic 8 UI Preview

```
┌─────────────────────────────────────────────────────────────────┐
│  Dashboard Header                                               │
│  [Tools] [Capabilities] [Hypergraph]  ← View mode toggle       │
│  Search: [____________] Filters: [Success ≥ 70%] [Usage ≥ 2]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Graph Area                             │  │
│  │                                                           │  │
│  │   ┌─────────────────────────────┐                        │  │
│  │   │  Cap: Create Issue from File │ ← Compound node        │  │
│  │   │  success: 95% | usage: 12   │                        │  │
│  │   │  ┌───────┐  ┌────────────┐ │                        │  │
│  │   │  │fs:read│  │gh:issue    │ │                        │  │
│  │   │  └───────┘  └────────────┘ │                        │  │
│  │   └─────────────────────────────┘                        │  │
│  │                                                           │  │
│  │   ┌─────────────────────────────┐                        │  │
│  │   │  Cap: Parse Config          │                        │  │
│  │   │  ┌───────┐  ┌────────────┐ │                        │  │
│  │   │  │fs:read│  │json:parse  │ │                        │  │
│  │   │  └───────┘  └────────────┘ │                        │  │
│  │   └─────────────────────────────┘                        │  │
│  │                                                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  Code Panel (on capability click)                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Capability: Create Issue from File                       │  │
│  │  Tools: filesystem:read, github:create_issue              │  │
│  │                                                           │  │
│  │  const content = await mcp.filesystem.read("config.json");│  │
│  │  const data = JSON.parse(content);                        │  │
│  │  await mcp.github.createIssue({                           │  │
│  │    title: data.title,                                     │  │
│  │    body: data.description                                 │  │
│  │  });                                                      │  │
│  │                                                           │  │
│  │  [Copy Code] [Try This]                                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│  Success: 95% | Usage: 12 | Last used: 2h ago                  │
└─────────────────────────────────────────────────────────────────┘
```
