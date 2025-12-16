# Casys PML - Epic Breakdown

**Author:** BMad **Date:** 2025-11-03 (Updated: 2025-12-07) **Project Level:** 3 **Target Scale:**
10 epics, 55+ stories total (Epics 1-8 + Epic 9: Auth & Multi-Tenancy)

---

## Overview

Ce document fournit le breakdown des epics **actifs** pour Casys PML.

**Completed Epics (1-6):** Archivés dans
[docs/archive/completed-epics-1-6.md](./archive/completed-epics-1-6.md)

**Active Epics:**

- **Epic 7:** Emergent Capabilities & Learning System (IN PROGRESS)
- **Epic 8:** Hypergraph Capabilities Visualization (BACKLOG)
- **Epic 9:** GitHub Authentication & Multi-Tenancy (PROPOSED)

---

## Completed Epics Summary

| Epic | Title                                     | Status  | Key Deliverables                                  |
| ---- | ----------------------------------------- | ------- | ------------------------------------------------- |
| 1    | Project Foundation & Context Optimization | ✅ DONE | PGlite + pgvector, semantic search, context <5%   |
| 2    | DAG Execution & Production Readiness      | ✅ DONE | Parallel execution, MCP gateway, 3-5x speedup     |
| 2.5  | Adaptive DAG Feedback Loops               | ✅ DONE | AIL/HIL, checkpoint/resume, command queue         |
| 3    | Agent Code Execution & Local Processing   | ✅ DONE | Deno sandbox, execute_code tool, PII protection   |
| 3.5  | Speculative Execution with Sandbox        | ✅ DONE | 0ms perceived latency, safe rollback              |
| 4    | Episodic Memory & Adaptive Learning       | ✅ DONE | Threshold persistence, context-aware suggestions  |
| 5    | Intelligent Tool Discovery                | ✅ DONE | Hybrid search (semantic + Adamic-Adar), templates |
| 6    | Real-time Graph Monitoring                | 🔄 4/5  | SSE events, D3.js dashboard, live metrics, **+6.5 EventBus** |

> **Full details:** See [completed-epics-1-6.md](./archive/completed-epics-1-6.md)
> **Note:** Epic 6 reopened for Story 6-5 (EventBus with BroadcastChannel, ADR-036) - requires 7.3b

---

## Epic 7: Emergent Capabilities & Learning System

> **ADRs:** ADR-027 (Execute Code Graph Learning), ADR-028 (Emergent Capabilities System), ADR-032
> (Sandbox Worker RPC Bridge) **Research:** docs/research/research-technical-2025-12-03.md
> **Status:** In Progress (Story 7.1 done, Story 7.1b planned, Tech Debt Tool Scoring done)

**Expanded Goal (2-3 sentences):**

Transformer Casys PML en système où les capabilities **émergent de l'usage** plutôt que d'être
pré-définies. Implémenter un paradigme où Claude devient un **orchestrateur de haut niveau** qui
délègue l'exécution à Casys PML, récupérant des capabilities apprises et des suggestions
proactives. Ce système apprend continuellement des patterns d'exécution pour cristalliser des
capabilities réutilisables, offrant une différenciation unique par rapport aux solutions
concurrentes (Docker Dynamic MCP, Anthropic Programmatic Tool Calling).

**Value Delivery:**

- ✅ **Tool Scoring Refactor:** Simplification des algos de suggestion tools (ADR-038) - DONE
- 🔄 **Track** les tools réellement appelés via Worker RPC Bridge (native tracing)
- 🔄 **Apprend** des patterns d'exécution et les cristallise en capabilities
- 🔄 **Suggère** proactivement des capabilities et tools pertinents
- 🔄 **Réutilise** le code prouvé (skip génération Claude ~2-5s)
- 🔄 **S'améliore** continuellement avec chaque exécution

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

**Estimation:** 13 stories (7.1-7.7c), ~3-4 semaines

---

### Story Breakdown - Epic 7

**Story 7.1: IPC Tracking - Tool Usage Capture** ⚠️ SUPERSEDED

> **Status:** Done (2025-12-05) - BUT approach superseded by Story 7.1b
>
> **Hidden Bug Discovered:** `wrapMCPClient()` from Story 3.2 **never actually worked** with the
> subprocess sandbox:
>
> ```typescript
> // context-builder.ts:148 - Creates functions
> const toolContext = wrapMCPClient(client, tools);
> // executor.ts:356 - Serializes for subprocess
> return `const ${key} = ${JSON.stringify(value)};`;
> // JSON.stringify(function) → undefined! Tools silently disappear.
> ```
>
> **Why never caught:** Tests used mock data, no integration test called real MCP tools from
> sandbox.
>
> **Solution:** Story 7.1b implements Worker RPC Bridge (ADR-032) which solves both problems:
>
> 1. Tool proxies instead of serialized functions (actually works!)
> 2. Native tracing in the bridge (no stdout parsing)
>
> **What to keep from 7.1:**
>
> - The trace event types (tool_start, tool_end)
> - The GraphRAG integration (updateFromExecution)
> - The test patterns
>
> **What to remove (Story 7.1b cleanup):**
>
> - `wrapMCPClient()` in context-builder.ts (broken, never worked)
> - `wrapToolCall()` in context-builder.ts
> - `parseTraces()` in gateway-server.ts
> - `rawStdout` in ExecutionResult

---

**Story 7.1b: Worker RPC Bridge - Native Tracing (ADR-032)**

As a system executing code with MCP tools, I want a Worker-based sandbox with RPC bridge for tool
calls, So that MCP tools work in sandbox AND all calls are traced natively without stdout parsing.

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
   interface RPCCallMessage {
     type: "rpc_call";
     id: string;
     server: string;
     tool: string;
     args: unknown;
   }
   interface RPCResultMessage {
     type: "rpc_result";
     id: string;
     success: boolean;
     result?: unknown;
     error?: string;
   }
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

As a system persisting learned patterns, I want to store capabilities immediately after first
successful execution, So that learning happens instantly without waiting for repeated patterns.

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

**Story 7.2b: Schema Inference (SWC-based)**

As a system exposing capability interfaces, I want to automatically infer parameter schemas from
TypeScript code, So that Claude knows what arguments to pass when calling capabilities.

**Stack (Deno native ✅):**

- `SWC` via `deno.land/x/swc@0.2.1` - Rust-based AST parser, 20x faster than ts-morph
- Native JSON Schema generation (no Zod needed)

> Note: SWC is Deno-native, validated in POC. ts-morph has Deno compatibility issues (#949, #950).

**Acceptance Criteria:**

1. `SchemaInferrer` class créée (`src/capabilities/schema-inferrer.ts`)
2. Method `inferSchema(code: string, mcpSchemas: Map<string, JSONSchema>)` → JSONSchema
3. Flow d'inférence:
   ```typescript
   // 1. SWC parse AST → trouve args.filePath, args.debug (MemberExpression + ObjectPattern)
   // 2. Inférer types depuis MCP schemas (args.filePath → fs.read.path → string)
   // 3. Générer JSON Schema directement
   ```
4. Détection `args.xxx` via AST traversal (MemberExpression + ObjectPattern destructuring)
5. Inférence de type depuis les MCP schemas quand possible
6. Fallback à `unknown` si type non-inférable
7. Génération JSON Schema directe (pas de Zod intermédiaire)
8. Update `workflow_pattern.parameters_schema` après inférence
9. Tests: code avec `args.filePath` utilisé dans `fs.read()` → schema.filePath = string
10. Tests: code avec `args.unknown` non-mappable → schema.unknown = unknown

**Prerequisites:** Story 7.2a (storage ready)

**Estimation:** 2-3 jours

---

**Story 7.3a: Capability Matching & search_capabilities Tool**

As an AI agent, I want to search for existing capabilities matching my intent, So that I can
discover and reuse proven code.

**Integration avec Adaptive Thresholds (Epic 4):**

- Réutilise `AdaptiveThresholdManager` existant
- Nouveau context type: `capability_matching`
- Seuil initial: `suggestionThreshold` (0.70 par défaut)
- Auto-ajustement basé sur FP (capability échoue) / FN (user génère nouveau code alors que
  capability existait)

**Acceptance Criteria:**

1. `CapabilityMatcher` helper class créée (`src/capabilities/matcher.ts`)
   - **Role:** Low-level matching logic (Vector search + Reliability filtering)
   - **Usage:** Used by `DAGSuggester`, NOT standalone
2. Integration dans `DAGSuggester`:
   - `dagSuggester.searchCapabilities(intent)` appelle `matcher.findMatch()`
3. Method `findMatch(intent)` → Capability | null
   - Threshold = `adaptiveThresholds.getThresholds().suggestionThreshold`
   - Pas de threshold hardcodé!
4. Vector search sur `workflow_pattern.intent_embedding`
5. Nouveau tool MCP `cai:search_capabilities` exposé
6. Input schema: `{ intent: string, include_suggestions?: boolean }`
   - Pas de threshold en param - géré par adaptive system
7. Output:
   `{ capabilities: Capability[], suggestions?: Suggestion[], threshold_used: number, parameters_schema: JSONSchema }`
8. Feedback loop: après exécution capability, appeler `adaptiveThresholds.recordExecution()`
9. Stats update: `usage_count++`, recalc `success_rate` après exécution
10. Tests: créer capability → search by similar intent → verify match uses adaptive threshold

**Prerequisites:** Story 7.2b (schema inference ready), Epic 4 (AdaptiveThresholdManager)

**Estimation:** 1-2 jours

---

**Story 7.3b: Capability Injection - Inline Functions (Option B)**

As a code executor, I want capabilities injected as inline functions in the Worker context, So that
code can call capabilities with zero RPC overhead and proper tracing.

**Architecture Decision: Option B (Inline Functions)**

> **Why Option B instead of RPC for capabilities?**
>
> - **No RPC overhead** for capability → capability calls (direct function call)
> - **Simpler** - capabilities are just functions in the same Worker context
> - **MCP tool calls** still go through RPC bridge (and get traced there natively)
>
> | Call Type               | Mechanism            | Tracing Location    |
> | ----------------------- | -------------------- | ------------------- |
> | Code → MCP tool         | RPC to bridge        | ✅ Bridge (native)  |
> | Code → Capability       | Direct function call | ✅ Worker (wrapper) |
> | Capability → MCP tool   | RPC to bridge        | ✅ Bridge (native)  |
> | Capability → Capability | Direct function call | ✅ Worker (wrapper) |

**How it works with Story 7.1b Worker RPC Bridge:**

```typescript
// In Worker context - generated by WorkerBridge
const mcp = {
  kubernetes: { deploy: (args) => __rpcCall("kubernetes", "deploy", args) },
  slack: { notify: (args) => __rpcCall("slack", "notify", args) },
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
  },
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

**ADR Integration (2025-12-08):**
- **ADR-036 BroadcastChannel:** capability_start/end emitted in real-time (not batched)
- This introduces the BroadcastChannel pattern, later generalized in Story 6.5 (Full EventBus)
- See Pre-Implementation Review in story file for additional AC11-12 (orchestrator, E2E tests)

**Estimation:** 2.5-3 jours (revised with orchestrator + E2E tests)

---

### Note Architecturale: Worker Context & Capability Layers (ADR-032)

Avec le Worker RPC Bridge (Story 7.1b), le Worker a accès à deux types de fonctions :

```typescript
// Worker context - generated by WorkerBridge

// 1. MCP Tools: Proxies that call bridge via RPC (traced in bridge)
const mcp = {
  github: { createIssue: (args) => __rpcCall("github", "createIssue", args) },
  filesystem: { read: (args) => __rpcCall("filesystem", "read", args) },
  kubernetes: { deploy: (args) => __rpcCall("kubernetes", "deploy", args) },
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
    await capabilities.runTests({ path: "./tests" }); // Direct call (no RPC)
    await capabilities.buildDocker({ tag: "v1.0" }); // Direct call (no RPC)
    await mcp.kubernetes.deploy({ image: "app:v1.0" }); // RPC
    __trace({ type: "capability_end", name: "deployProd", success: true });
  },
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

**Story 7.4: DAGSuggester Extension - Mixed DAG (Tools + Capabilities)**

As an AI agent, I want DAGs that include both MCP tools AND capabilities, So that I can
reuse learned patterns in larger workflows.

**Context:**
This story implements the "Strategic Discovery" mode (Passive Suggestion) defined in ADR-038.

**Algorithm (ADR-038):**

- **Mode:** Passive Suggestion (Implicit Context)
- **Algo:** `Score = ToolsOverlap * (1 + SpectralClusterBoost)`
- **Hypergraph:** Bipartite graph (Tools ↔ Capabilities) for Spectral Clustering

**Acceptance Criteria:**

1. `DAGSuggester.suggestDAG()` étendu pour chercher aussi les capabilities
2. Nouveau type de task dans DAGStructure: `type: "tool" | "capability"`
3. **Spectral Clustering Integration:**
   - Implementer `GraphRAGEngine.computeSpectralClusters()` (ou library équivalente)
   - Identifier le cluster dominant du contexte actuel
   - Booster les capabilities de ce cluster (ADR-038)
4. **Ranking unifié:**
   - Trier tools (Recency/Cooc) et capabilities (Spectral/Overlap) dans une liste unique
5. `execute_dag` mis à jour pour gérer les deux types
6. `predictNextNodes()` retourne mix tools + capabilities
7. Observabilité (ADR-039) pour tracer les suggestions spectrales

**Prerequisites:** Story 7.3b (capability injection)

**Estimation:** 2-3 jours

---

**Story 7.5a: Capability Result Cache**

As a system optimizing for performance, I want cached capability results, So that repeat executions
are instant.

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

As a system managing storage, I want periodic cleanup of unused capabilities, So that storage stays
clean.

**Note:** Cette story est optionnelle. Avec eager learning, on stocke tout. Le pruning peut être
activé si le stockage devient un problème.

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

**Story 7.6: Algorithm Observability Implementation (ADR-039)**

As a system administrator, I want to trace algorithm decisions and outcomes, So that I can validatethe scoring weights and detect anomalies.

**Context:**
ADR-039 defines a logging structure for scoring algorithms. This story implements the persistence layer.

**Acceptance Criteria:**

1. Migration Drizzle pour table `algorithm_traces` (PostgreSQL/PGlite)
2. `AlgorithmTracer` service pour bufferiser et écrire les logs (async)
3. Integration dans `DAGSuggester` et `CapabilityMatcher` pour logger chaque décision
4. Route API pour feedback (Frontend peut dire "J'ai cliqué sur cette suggestion")
5. Metrics de base:
   - `avg_final_score` par type (tool vs capability)
   - `conversion_rate` (suggestions acceptées / total)
   - `spectral_relevance` (est-ce que le cluster boost prédit le clic ?)

**Prerequisites:** Story 7.4 (Scoring implemented)

**Estimation:** 1-2 jours

---

**Story 7.7a: Permission Inference - Analyse Automatique des Permissions (ADR-035)**

As a system executing capabilities in sandbox, I want automatic permission inference from code analysis,
So that capabilities run with minimal required permissions (principle of least privilege).

**Context:**
Deno demande actuellement des permissions globales pour tout le sandbox. Avec Deno 2.5+ Permission Sets,
on peut définir des profils de permissions granulaires. Cette story infère automatiquement le profil
approprié en analysant le code via SWC (réutilisation de Story 7.2b).

**Permission Profiles Définis:**

| Profile | Read | Write | Net | Env | Use Case |
|---------|------|-------|-----|-----|----------|
| `minimal` | ❌ | ❌ | ❌ | ❌ | Pure computation, math |
| `readonly` | `["./data"]` | ❌ | ❌ | ❌ | Data analysis |
| `filesystem` | `["./"]` | `["/tmp"]` | ❌ | ❌ | File processing |
| `network-api` | ❌ | ❌ | `["api.*"]` | ❌ | API calls (fetch) |
| `mcp-standard` | ✅ | `["/tmp"]` | ✅ | Limited | Standard MCP tools |
| `trusted` | ✅ | ✅ | ✅ | ✅ | Manual/verified capabilities |

**Acceptance Criteria:**

1. `PermissionInferrer` class créée (`src/capabilities/permission-inferrer.ts`)
2. Réutilise SWC parsing de Story 7.2b pour analyser l'AST
3. Détection des patterns:
   - `fetch(`, `Deno.connect` → network-api
   - `mcp.filesystem`, `mcp.fs`, `Deno.readFile` → filesystem
   - `Deno.env`, `process.env` → env access
4. Method `inferPermissions(code: string)` retourne:
   ```typescript
   interface InferredPermissions {
     permissionSet: string;       // "minimal" | "readonly" | "network-api" | etc.
     confidence: number;          // 0-1
     detectedPatterns: string[];  // ["fetch", "mcp.filesystem"]
   }
   ```
5. Migration DB ajoutée (012):
   ```sql
   ALTER TABLE workflow_pattern
   ADD COLUMN permission_set VARCHAR(50) DEFAULT 'minimal',
   ADD COLUMN permission_confidence FLOAT DEFAULT 0.0;
   CREATE INDEX idx_workflow_pattern_permission ON workflow_pattern(permission_set);
   ```
6. Integration avec `saveCapability()` - permission inférée automatiquement au stockage
7. Tests: code avec `fetch()` → permission_set = "network-api"
8. Tests: code avec `mcp.fs.read()` → permission_set = "filesystem"
9. Tests: code sans I/O → permission_set = "minimal", confidence = 0.95

**Files to Create:**
- `src/capabilities/permission-inferrer.ts` (~120 LOC)

**Files to Modify:**
- `src/capabilities/capability-store.ts` - Appeler inferPermissions au save (~15 LOC)
- `drizzle/migrations/` - Migration 012 (~20 LOC)

**Prerequisites:** Story 7.2b (SWC parsing disponible)

**Estimation:** 1-2 jours

---

**Story 7.7b: Sandbox Permission Integration - Exécution avec Permissions Granulaires (ADR-035)**

As a sandbox executor, I want to run capabilities with their inferred permission set,
So that each capability has only the minimum permissions required.

**Context:**
Cette story modifie `SandboxExecutor` pour utiliser les permission sets stockés en DB.
Inclut un fallback pour Deno < 2.5 avec les flags explicites.

**Architecture:**

```
┌─────────────────────────────────────────────────────────────────┐
│  Capability Execution Flow                                       │
│                                                                  │
│  1. Load capability from DB (includes permission_set)            │
│  2. Determine final permissions:                                 │
│     - source="manual" → use stored permission_set                │
│     - confidence < 0.7 → use "minimal" (safety)                  │
│     - else → use inferred permission_set                         │
│  3. Execute with determined permissions                          │
└─────────────────────────────────────────────────────────────────┘
```

**Acceptance Criteria:**

1. `SandboxExecutor.execute()` accepte paramètre `permissionSet?: string`
2. Ajout des permission sets dans `deno.json`:
   ```json
   {
     "permissions": {
       "minimal": { "read": false, "write": false, "net": false, "env": false },
       "readonly": { "read": ["./data", "/tmp"], "write": false, "net": false },
       "network-api": { "read": false, "write": false, "net": true },
       "filesystem": { "read": ["./"], "write": ["/tmp"], "net": false },
       "mcp-standard": { "read": true, "write": ["/tmp", "./output"], "net": true, "env": ["HOME", "PATH"] },
       "trusted": { "read": true, "write": true, "net": true, "env": true }
     }
   }
   ```
3. Deno 2.5+ : utilise `--permission-set=${permissionSet}`
4. Deno < 2.5 : fallback avec `permissionSetToFlags()` mapping
5. Method `supportsPermissionSets()` détecte version Deno
6. `--no-prompt` toujours ajouté (jamais d'interaction)
7. Tests e2e: capability "minimal" → PermissionDenied si tente fetch
8. Tests e2e: capability "network-api" → fetch fonctionne
9. Tests: fallback flags pour Deno 2.4

**Files to Modify:**
- `src/sandbox/executor.ts` - Ajout permission set support (~60 LOC)
- `deno.json` - Permission sets configuration (~30 LOC)

**Prerequisites:** Story 7.7a (Permission Inference)

**Estimation:** 1-2 jours

---

**Story 7.7c: HIL Permission Escalation - Escalade avec Approbation Humaine (ADR-035)**

As a user, I want to approve permission escalations when a capability needs more access,
So that security is maintained while allowing legitimate operations.

**Context:**
Quand une capability échoue avec PermissionDenied, le système peut demander à l'utilisateur
d'approuver une escalade de permissions. Intégration avec le système HIL existant (DAG executor).

**Flow:**

```
┌─────────────────────────────────────────────────────────────────┐
│  Execution fails: PermissionDenied                               │
│                                                                  │
│  → Detect error type (read, write, net, env)                     │
│  → Suggest escalation (minimal → network-api)                    │
│  → Request HIL approval via existing ControlledExecutor          │
│  → If approved: update capability.permission_set in DB           │
│  → Retry execution with new permissions                          │
│  → Log decision for audit trail                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Acceptance Criteria:**

1. Interface `PermissionEscalationRequest` définie:
   ```typescript
   interface PermissionEscalationRequest {
     capabilityId: string;
     currentSet: string;          // "minimal"
     requestedSet: string;        // "network-api"
     reason: string;              // "PermissionDenied: net access to api.example.com"
     detectedOperation: string;   // "fetch"
   }
   ```
2. `suggestEscalation(error: string)` analyse l'erreur et suggère le profil approprié
3. Integration avec `ControlledExecutor.requestHILApproval()` existant
4. Si approuvé: UPDATE capability permission_set en DB
5. Si refusé: log et retourne erreur propre à l'utilisateur
6. Audit logging: toutes les décisions d'escalation loggées
   ```typescript
   interface PermissionAuditLog {
     timestamp: Date;
     capabilityId: string;
     from: string;
     to: string;
     approved: boolean;
     approvedBy?: string;
   }
   ```
7. Table `permission_audit_log` créée (migration 013)
8. Tests: capability échoue → HIL request → approve → retry succeeds
9. Tests: capability échoue → HIL request → deny → error propagée
10. Tests: audit log contient toutes les décisions

**Files to Create:**
- `src/capabilities/permission-escalation.ts` (~100 LOC)

**Files to Modify:**
- `src/dag/controlled-executor.ts` - Ajout type "permission_escalation" (~30 LOC)
- `drizzle/migrations/` - Migration 013 permission_audit_log (~15 LOC)

**Prerequisites:** Story 7.7b (Sandbox Permission Integration), HIL system (Story 2.5)

**Estimation:** 1-1.5 jours

---

### Epic 7 Capability Lifecycle (Architecture Unifiée)

```
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 1: EXECUTE & LEARN (Eager - dès exec 1)                  │
├─────────────────────────────────────────────────────────────────┤
│  Intent → execute_code → Worker Sandbox → Track via RPC        │
│  → Success? UPSERT workflow_pattern immédiatement               │
│  → ON CONFLICT: usage_count++, update success_rate              │
│  → Capability discoverable IMMÉDIATEMENT                        │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 2: DAG SUGGESTION (Mixed Tools + Capabilities)           │
├─────────────────────────────────────────────────────────────────┤
│  Intent → DAGSuggester.suggestDAG()                             │
│      ├─→ searchToolsHybrid() (existing)                         │
│      └─→ searchCapabilities() (NEW - Story 7.4)                 │
│                                                                 │
│  → Ranking unifié: tools + capabilities triés ensemble          │
│  → Threshold adaptatif (AdaptiveThresholdManager)               │
│  → Hypergraph PageRank (bipartite tools ↔ capabilities)        │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 3: EXECUTE MIXED DAG                                      │
├─────────────────────────────────────────────────────────────────┤
│  execute_dag orchestre:                                         │
│      ├─→ type: "tool" → MCP call (aujourd'hui)                  │
│      │                → execute_code (future)                   │
│      └─→ type: "capability" → execute_code(cap.code)            │
│                                                                 │
│  → Tout passe par sandbox (isolation, tracing)                  │
│  → Capabilities = appels execute_code avec code pré-existant    │
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

**Architecture clé:**

- ✅ **Un seul suggester:** `DAGSuggester` gère tools ET capabilities
- ✅ **Pas de classe séparée:** Pas de `CapabilityMatcher` ni `SuggestionEngine`
- ✅ **Mixed DAG:** tasks peuvent être `type: "tool"` ou `type: "capability"`
- ✅ **Thresholds adaptatifs:** Pas de valeurs hardcodées (0.85, 0.7)
- ✅ **Future:** Tout via `execute_code` (même les tools simples)

---

### Epic 7 Market Comparison

| Feature            | Docker Dynamic MCP | Anthropic PTC | **Casys PML Epic 7**       |
| ------------------ | ------------------ | ------------- | --------------------------- |
| **Discovery**      | Runtime            | Pre-config    | Pre-exec + Capability Match |
| **Learning**       | ❌ None            | ❌ None       | ✅ GraphRAG + Capabilities  |
| **Suggestions**    | ❌ None            | ❌ None       | ✅ Louvain + Adamic-Adar    |
| **Code Reuse**     | ❌ None            | ❌ None       | ✅ Capability cache         |
| **Recursion Risk** | ⚠️ Possible        | N/A           | ❌ Impossible (scope fixe)  |
| **Security**       | Container          | Sandbox       | Sandbox + scope fixe        |

**Différenciateur clé:**

> "Casys PML apprend de chaque exécution et suggère des capabilities optimisées - comme un
> pair-programmer qui se souvient de tout."

---

## Epic 8: Hypergraph Capabilities Visualization

> **ADR:** ADR-029 (Hypergraph Capabilities Visualization) **Depends on:** Epic 6 (Dashboard), Epic
> 7 (Capabilities Storage) **Status:** Proposed (2025-12-04)

**Expanded Goal (2-3 sentences):**

Visualiser les capabilities comme **hyperedges** (relations N-aires entre tools) via D3.js
force-directed graph, permettant aux utilisateurs de voir, explorer et réutiliser le code appris par le
système. Une capability n'est pas une relation binaire mais une relation N-aire connectant plusieurs
tools ensemble, nécessitant une approche de visualisation différente du graph classique.

> **Note (Dec 2024):** Migré de Cytoscape.js vers D3.js car les compound nodes Cytoscape ne
> supportent pas plusieurs parents (un tool partagé entre capabilities). Voir ADR-029.

**Value Delivery:**

À la fin de cet epic, un développeur peut:

- Voir visuellement quelles capabilities ont été apprises par le système
- Explorer les relations hypergraph entre tools et capabilities
- Visualiser le code_snippet de chaque capability avec syntax highlighting
- Copier et réutiliser le code prouvé directement depuis le dashboard
- Filtrer et rechercher les capabilities par intent, success_rate, usage

**Décision Architecturale (ADR-029):** D3.js Force-Directed Graph

- Capability = node (violet)
- Tools = nodes connectés via edges (hyperedges supportés)
- Click capability → Code Panel avec syntax highlighting
- Toggle button: [Tools] [Capabilities] [Hypergraph]

> **Migration:** Originalement prévu avec Cytoscape.js compound graphs, mais migré vers D3.js
> pour supporter les hyperedges (un tool peut appartenir à plusieurs capabilities).

**Estimation:** 5 stories, ~1-2 semaines

---

### Story Breakdown - Epic 8

**Story 8.1: Capability Data API**

As a dashboard developer, I want API endpoints to fetch capabilities and hypergraph data, So that
the frontend can visualize the learned capabilities.

**Acceptance Criteria:**

1. Endpoint `GET /api/capabilities` créé
   - Response: `{ capabilities: Capability[], total: number }`
   - Capability includes: id, name, description, code_snippet, tools_used[], success_rate,
     usage_count, community_id
2. Query parameters supportés:
   - `?community_id=N` - Filter by Louvain community
   - `?min_success_rate=0.7` - Filter by quality
   - `?min_usage=2` - Filter by usage
   - `?limit=50&offset=0` - Pagination
3. Endpoint `GET /api/graph/hypergraph` créé
   - Response: `{ nodes: GraphNode[], edges: GraphEdge[], capabilities_count, tools_count }`
   - Nodes include both tools and capabilities with `type` field
4. Join sur `workflow_pattern` et `tool_schemas` pour récupérer metadata
5. Intent preview: premiers 100 caractères de l'intent embedding description
6. Tests HTTP: verify JSON structure, filters work correctly
7. OpenAPI documentation for both endpoints

**Prerequisites:** Epic 7 Story 7.2 (workflow_pattern table with code_snippet)

---

**Story 8.2: Compound Graph Builder**

As a system architect, I want a HypergraphBuilder class that converts capabilities to D3.js
graph nodes with hyperedge support, So that the visualization can represent N-ary relationships correctly.

**Acceptance Criteria:**

1. `HypergraphBuilder` class créée (`src/visualization/hypergraph-builder.ts`)
2. Method `buildCompoundGraph(capabilities: Capability[], tools: Tool[])` → GraphElements
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

As a power user, I want a "Hypergraph" view mode in the dashboard, So that I can visualize
capabilities as compound nodes containing their tools.

> **IMPORTANT:** Cette story DOIT intégrer le mode hypergraph dans le dashboard EXISTANT (Epic 6).
> Pas de nouvelle page - c'est un toggle de vue dans le même dashboard. **Requiert:** Consultation
> avec UX Designer agent avant implémentation pour valider l'intégration UI.

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

As a developer, I want to see the code_snippet when I click on a capability, So that I can
understand what the capability does and copy the code.

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

As a user looking for reusable capabilities, I want to search and filter capabilities, So that I can
find relevant code patterns quickly.

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
│  - Returns D3.js graph elements with hyperedge support          │
└────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│  D3.js Force-Directed Graph (existing dashboard)                │
│  - d3-force layout with zoom/pan (d3-zoom)                     │
│  - Capability nodes: violet                                     │
│  - Tool nodes: colored by server (existing)                    │
│  - Hyperedges: tool can link to multiple capabilities          │
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

---

## Epic 9: GitHub Authentication & Multi-Tenancy

> **Tech-Spec:** [tech-spec-github-auth-multitenancy.md](./sprint-artifacts/tech-spec-github-auth-multitenancy.md)
> **Status:** Proposed (2025-12-07)
> **Author:** Erwan + BMAD Party Mode

**Expanded Goal (2-3 sentences):**

Implémenter un modèle d'authentification hybride supportant deux modes d'utilisation : **Cloud (SaaS)** avec GitHub OAuth et API Keys pour le multi-tenant, et **Self-hosted** sans authentification pour une utilisation locale offline single-user. Ce système permet de tracker les utilisateurs individuellement, d'appliquer le rate limiting par user_id, et d'isoler les données personnelles tout en gardant l'apprentissage GraphRAG global partagé.

**Value Delivery:**

À la fin de cet epic, Casys PML:

- **Supporte deux modes** : Cloud (GitHub OAuth + API Key) et Self-hosted (zero-auth)
- **Isole les données** : dag_executions par user_id, GraphRAG reste global
- **Génère des API Keys** : Format `ac_xxx` pour accès MCP Gateway
- **Protège les routes** : Dashboard et API authentifiés en mode cloud
- **Simplifie le self-hosted** : Aucune configuration requise, user_id="local" automatique

**Architecture Réelle (2 Serveurs):**

```

┌─────────────────────────────────────────────────────────────────┐
│ AGENTCARDS - DUAL SERVER ARCHITECTURE │
├─────────────────────────────────────────────────────────────────┤
│ │
│ ┌───────────────────────────┐ ┌───────────────────────────┐ │
│ │ API Server (port 3003) │ │ Fresh Dashboard (8080) │ │
│ │ src/mcp/gateway-server.ts│ │ src/web/ │ │
│ │ │ │ │ │
│ │ Deno.serve() natif │ │ Fresh 2.x │ │
│ │ • /mcp (MCP protocol) │ │ • / (landing) │ │
│ │ • /api/graph/_ │ │ • /dashboard │ │
│ │ • /events/stream (SSE) │ │ • /auth/_ (OAuth) │ │
│ │ • /health │ │ • /blog/\* │ │
│ │ │ │ │ │
│ │ Auth: API Key header │ │ Auth: Session (cookie) │ │
│ └───────────────────────────┘ └───────────────────────────┘ │
│ │ │ │
│ └──────────┬──────────────────┘ │
│ ▼ │
│ ┌─────────────────────────┐ │
│ │ Shared Auth Module │ │
│ │ src/lib/auth.ts │ │
│ │ • isCloudMode() │ │
│ │ • validateApiKey() │ │
│ │ • validateSession() │ │
│ └─────────────────────────┘ │
│ │
└─────────────────────────────────────────────────────────────────┘

```

**Mode Detection (les 2 serveurs):**

```

GITHUB_CLIENT_ID défini ?
│
┌───┴───┐
▼ ▼
NON OUI
│ │
▼ ▼
LOCAL CLOUD
MODE MODE
│ │
▼ ▼
user_id Require
="local" API Key
ou Session

````

**Isolation des Données (Cloud Mode):**

| Données ISOLÉES par user_id | Données GLOBALES |
|------------------------------|------------------|
| dag_executions | mcp_tools |
| execution_traces | tool_graph |
| user_preferences | embeddings |
| (future) custom_tools | usage_patterns |

**Estimation:** 5 stories, ~1-2 semaines

---

### Story Breakdown - Epic 9

**Story 9.1: Infrastructure Auth - Schema & Helpers**

As a system supporting multi-tenant authentication, I want a users table and API key helpers, So that I can persist user data and securely manage API keys.

**Acceptance Criteria:**

1. Migration Drizzle créée: table `users` (`src/db/schema/users.ts`)
   ```typescript
   export const users = sqliteTable("users", {
     id: text("id").primaryKey(), // UUID
     github_id: text("github_id").unique(),
     username: text("username").notNull(),
     email: text("email"),
     avatar_url: text("avatar_url"),
     api_key_hash: text("api_key_hash"),        // argon2 hash
     api_key_prefix: text("api_key_prefix"),    // "ac_" + 8 chars
     api_key_created_at: integer("api_key_created_at", { mode: "timestamp" }),
     created_at: integer("created_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
     updated_at: integer("updated_at", { mode: "timestamp" }),
   });
````

2. API Key helpers créés (`src/lib/api-key.ts`):
   - `generateApiKey()` → `{ key: "ac_xxx", prefix: "ac_xxxxxxxx" }`
   - `hashApiKey(key)` → argon2 hash
   - `verifyApiKey(key, hash)` → boolean
   - `getApiKeyPrefix(key)` → first 11 chars for lookup
3. Format API Key: `ac_` + 24 random chars (crypto.randomUUID style)
4. Dépendance ajoutée: `@ts-rex/argon2` pour hashing
5. Migration idempotente (peut être rejouée)
6. Tests unitaires:
   - generateApiKey() format correct (`ac_` + 24 chars)
   - hashApiKey/verifyApiKey roundtrip
   - getApiKeyPrefix extraction correcte

**Technical Notes:**

- Utiliser Drizzle ORM conventions existantes (`src/db/`)
- API Key jamais loggée en clair, toujours hashée

**Prerequisites:** None (première story de l'epic)

**Estimation:** 0.5-1 jour

---

**Story 9.2: GitHub OAuth & Auth Routes**

As a cloud user, I want to authenticate via GitHub OAuth, So that I can access the dashboard and get my API key.

**Acceptance Criteria:**

1. Deno KV OAuth configuré (`src/server/auth/oauth.ts`)
   - Provider: GitHub uniquement
   - Scope: `read:user`, `user:email`
   - Utilise `jsr:@deno/kv-oauth` (officiel Deno)
2. Routes auth Fresh créées (`src/web/routes/auth/`):
   - `signin.ts` → `GET /auth/signin` → Redirect vers GitHub OAuth
   - `callback.ts` → `GET /auth/callback` → Handle OAuth callback, create/update user, generate API Key
   - `signout.ts` → `GET /auth/signout` → Destroy session, redirect to landing
   - `regenerate.ts` → `POST /auth/regenerate` → Invalidate old key, generate new one
3. Callback flow:
   - Fetch GitHub user profile (username, email, avatar)
   - Upsert user in `users` table
   - Generate API Key si première connexion
   - Create session in Deno KV (30 days TTL)
   - Redirect to `/dashboard`
4. Session storage: Deno KV avec TTL 30 jours
5. CSRF protection via state parameter (built into kv-oauth)
6. Tests:
   - Mock GitHub OAuth flow
   - Verify user created on first login
   - Verify API Key generated
   - Verify session created with correct TTL

**Technical Notes:**

- Variables env requises (cloud): `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `AUTH_REDIRECT_URL`
- Cookie flags: HttpOnly, Secure (prod), SameSite=Lax

**Prerequisites:** Story 9.1 (users table ready)

**Estimation:** 1-1.5 jours

---

**Story 9.3: Auth Middleware & Mode Detection (Dual-Server)**

As a system administrator, I want automatic mode detection based on environment, So that self-hosted deployments work without any auth configuration.

**Acceptance Criteria:**

1. Mode detection + validation helpers créés (`src/lib/auth.ts` - shared module):

   ```typescript
   // Mode detection
   export const isCloudMode = () => !!Deno.env.get("GITHUB_CLIENT_ID");
   export const getDefaultUserId = () => (isCloudMode() ? null : "local");

   // API Server helper (encapsule toute la logique)
   export async function validateRequest(
     req: Request
   ): Promise<{ user_id: string } | null> {
     if (!isCloudMode()) return { user_id: "local" };

     const apiKey = req.headers.get("x-api-key");
     if (!apiKey) return null;

     return await validateApiKey(apiKey); // lookup prefix + verify hash
   }
   ```

2. **Fresh Dashboard auth (port 8080)** - `src/web/routes/_middleware.ts`:
   - **Cloud mode:** Vérifie session cookie via Deno KV
   - **Local mode:** Bypass auth, inject `user_id = "local"`
   - Injecte `user` dans Fresh context: `ctx.state.user = user`
   - Protected: `/dashboard/*`, `/settings/*`
   - Redirects non-auth to `/auth/signin`
3. **API Server auth (port 3003)** - `src/mcp/gateway-server.ts`:
   - Utilise `validateRequest()` du module partagé (pas de logique inline)
   - Return 401 JSON si invalide: `{ error: "Unauthorized" }`
   - Protected: `/mcp`, `/api/graph/*`, `/events/stream`
   - Ajout ~15 lignes au début du handler:
   ```typescript
   // Dans Deno.serve handler, après CORS preflight:
   const PUBLIC_ROUTES = ["/health"];
   if (!PUBLIC_ROUTES.includes(url.pathname)) {
     const auth = await validateRequest(req);
     if (!auth) {
       return new Response(JSON.stringify({ error: "Unauthorized" }), {
         status: 401,
         headers: { "Content-Type": "application/json", ...corsHeaders },
       });
     }
     // TODO: propager auth.user_id dans le contexte d'exécution
   }
   ```
4. Routes protégées (résumé):
   | Route | Server | Auth Cloud | Auth Local |
   |-------|--------|------------|------------|
   | `/dashboard/*` | Fresh (8080) | Session cookie | Bypass |
   | `/settings/*` | Fresh (8080) | Session cookie | Bypass |
   | `/mcp` | API (3003) | API Key header | Bypass |
   | `/api/graph/*` | API (3003) | API Key header | Bypass |
   | `/events/stream` | API (3003) | API Key header | Bypass |
5. Tests:
   - Mode detection avec/sans GITHUB_CLIENT_ID (deux serveurs)
   - Fresh middleware: session validation, redirect, bypass local
   - gateway-server.ts: API Key validation, 401 response, bypass local
   - Shared `isCloudMode()` cohérent entre les deux serveurs

**Technical Notes:**

- **IMPORTANT:** Auth implémentée à DEUX endroits (Fresh middleware + gateway-server.ts handler)
- En mode local, TOUTES les requêtes passent avec `user_id = "local"`
- Log niveau INFO du mode détecté au démarrage (chaque serveur)

**Prerequisites:** Story 9.2 (OAuth routes ready)

**Estimation:** 1.5 jours

---

**Story 9.4: Landing Page & Dashboard UI (Auth Additions)**

As a new user, I want a landing page with GitHub sign-in and a dashboard showing my API key, So that I can easily onboard and configure my MCP client.

**État Actuel (déjà implémenté):**

- Landing page (`src/web/routes/index.tsx`, 60KB) - Design complet avec animations, dark theme
- Dashboard (`src/web/routes/dashboard.tsx`) - GraphExplorer + MetricsPanel fonctionnels
- Design system établi: `--accent: #FFB86F`, dark theme, fonts Geist/Instrument Serif

**Acceptance Criteria:**

1. **Landing page - Ajouts auth** (`src/web/routes/index.tsx`):
   - Header: Bouton "Sign in with GitHub" (cloud mode) - ~30 lignes
   - Header: Badge "Local mode" si `!isCloudMode()` - conditional
   - Design cohérent avec le style existant (couleurs, fonts)
2. **Dashboard - Header auth** (`src/web/routes/dashboard.tsx`):
   - Ajouter header bar avec avatar + username GitHub
   - Lien vers Settings
   - ~50 lignes à ajouter au composant existant
3. **Settings page (NOUVELLE)** (`src/web/routes/dashboard/settings.tsx`):
   - Section "Your API Key":
     - Key masquée: `ac_live_••••••••`
     - Bouton "Show" pour révéler temporairement (5s)
     - Bouton "Copy" avec toast confirmation
   - Section "MCP Configuration":
     ```json
     {
       "cai": {
         "command": "cai",
         "args": ["serve"],
         "env": { "CAI_API_KEY": "ac_xxx" }
       }
     }
     ```
     - Bouton "Copy Config"
   - Bouton "Regenerate API Key" avec confirmation modal
   - Bouton "Delete Account" avec double confirmation
   - Delete flow: anonymise données (`user_id` → `deleted-{uuid}`)
4. Conditional rendering basé sur `isCloudMode()`:
   - Cloud: affiche auth UI complète
   - Local: skip auth sections, affiche "Running in local mode"
5. Tests E2E (Playwright optionnel):
   - Landing → Sign in → Dashboard flow
   - Copy API Key functionality
   - Regenerate API Key flow

**Technical Notes:**

- **NE PAS refaire le design** - ajouter uniquement les éléments auth
- Réutiliser les CSS variables existantes (`var(--accent)`, `var(--bg)`, etc.)
- Dark mode déjà supporté dans le dashboard existant

**Prerequisites:** Story 9.3 (middleware protecting routes)

**Estimation:** 1.5-2 jours (principalement Settings page)

---

**Story 9.5: Rate Limiting & Data Isolation**

As a system ensuring fair usage, I want rate limiting per user_id and data isolation, So that cloud users have individual quotas and can't see each other's data.

**Acceptance Criteria:**

1. Rate limiter adapté (`src/lib/rate-limiter.ts`):
   - Cloud mode: clé = `user_id`
   - Local mode: rate limiting désactivé OU clé = IP (configurable)
   - Method: `getRateLimitKey(c: Context)` → string
2. Migration: FK `user_id` sur `dag_executions`:
   ```typescript
   export const dagExecutions = sqliteTable("dag_executions", {
     // ... existing fields ...
     user_id: text("user_id"), // "local" ou UUID
     created_by: text("created_by"),
     updated_by: text("updated_by"),
   });
   ```
3. Queries filtrées par `user_id`:
   - `GET /api/executions` → `WHERE user_id = ?`
   - Dashboard metrics → filtrées par user
4. Ownership tracking:
   - `created_by` set on INSERT
   - `updated_by` set on UPDATE
5. Anonymisation à la suppression:
   ```sql
   UPDATE dag_executions SET user_id = 'deleted-{uuid}' WHERE user_id = ?;
   DELETE FROM users WHERE id = ?;
   ```
6. Tests:
   - User A ne voit pas les DAGs de User B
   - Rate limit appliqué par user_id (cloud)
   - Anonymisation correcte à la suppression
   - Mode local: pas de filtering, tout visible

**Technical Notes:**

- GraphRAG et embeddings restent GLOBAUX (shared learning)
- Index sur `user_id` pour performance queries

**Prerequisites:** Story 9.4 (UI ready for testing)

**Estimation:** 1-1.5 jours

---

**Story 9.6: MCP Config & Secrets Management**

As a cloud user, I want to configure my API keys for third-party MCPs via the dashboard, So that I can use services like Tavily or OpenAI with my own credentials (BYOK).

**Acceptance Criteria:**

1. `user_secrets` table pour stocker les clés chiffrées:
   ```typescript
   export const userSecrets = sqliteTable("user_secrets", {
     id: text("id").primaryKey(),
     userId: text("user_id").references(() => users.id).notNull(),
     secretName: text("secret_name").notNull(),   // "TAVILY_API_KEY"
     ciphertext: text("ciphertext").notNull(),    // AES-256-GCM encrypted
     iv: text("iv").notNull(),                    // Unique IV per secret
     createdAt: integer("created_at"),
     updatedAt: integer("updated_at"),
   });
   ```
2. `user_mcp_configs` table pour les MCPs activés par user:
   ```typescript
   export const userMcpConfigs = sqliteTable("user_mcp_configs", {
     id: text("id").primaryKey(),
     userId: text("user_id").references(() => users.id).notNull(),
     mcpName: text("mcp_name").notNull(),        // "tavily", "github", etc.
     enabled: integer("enabled").default(1),
     configJson: text("config_json"),
     createdAt: integer("created_at"),
     updatedAt: integer("updated_at"),
   });
   ```
3. Encryption helpers (`src/lib/secrets.ts`):
   - `encryptSecret(plaintext)` → `{ ciphertext, iv }`
   - `decryptSecret(ciphertext, iv)` → `plaintext`
   - AES-256-GCM with `SECRETS_MASTER_KEY` from env
4. API endpoints:
   - `GET /api/user/secrets` → liste des secrets (names only, pas les valeurs)
   - `POST /api/user/secrets` → ajouter/update un secret
   - `DELETE /api/user/secrets/:name` → supprimer un secret
   - `GET /api/user/mcp-configs` → MCPs activés
   - `POST /api/user/mcp-configs` → enable/disable MCP
5. UI Settings → "API Keys" section:
   - Liste des MCPs disponibles avec statut (configured/not configured)
   - Champs pour entrer les clés API (masqués)
   - GitHub utilise le token OAuth du login
6. MCP Gateway integration:
   - Load user's secret at call time
   - Decrypt → inject into MCP call → discard from memory
   - Never log decrypted keys
7. Tests:
   - Encryption/decryption roundtrip
   - API endpoints require auth
   - Secrets isolated by user_id
   - MCP call uses correct user key

**Technical Notes:**

- `SECRETS_MASTER_KEY` (32 bytes base64) in Deno Deploy secrets
- Future: migrate to KMS envelope encryption for production
- MCP catalog managed by CAI (no custom MCPs for MVP)
- See ADR-040 for full architecture

**TODO from Story 9.5 - Cloud userId Propagation:**
- **Context:** Story 9.5 implemented DB infrastructure (user_id column, migration 013) but deferred cloud mode userId tracking
- **Blocker:** Private methods in executor don't have access to authResult
- **Solution:** Since Story 9.6 modifies gateway for secrets injection, add userId propagation:
  1. `gateway-server.ts`: Pass `userId: authResult.user_id` to DAGExecutor.execute()
  2. `controlled-executor.ts`: Accept userId in ExecuteOptions, use in recordExecution()
  3. `graph-engine.ts`: Already supports execution.userId (Story 9.5 Task 4)
- **Benefit:** Single refactoring for secrets + userId tracking (same code path)
- **Files:** gateway-server.ts, controlled-executor.ts (already modified for secrets in 9.6)

**Prerequisites:** Story 9.5 (user_id FK exists)

**Estimation:** 2.5-3 jours (includes userId propagation from 9.5)

---

### Epic 9 Acceptance Criteria Summary

**Cloud Mode (GitHub OAuth):**

| AC  | Description                                            | Story    |
| --- | ------------------------------------------------------ | -------- |
| AC1 | Non-auth user → redirect to landing with GitHub button | 9.3, 9.4 |
| AC2 | OAuth complete → user created + API Key generated      | 9.2      |
| AC3 | Dashboard shows masked API Key + MCP config            | 9.4      |
| AC4 | Regenerate API Key → old key invalidated               | 9.2, 9.4 |

**Self-hosted Mode (Local):**

| AC  | Description                                | Story |
| --- | ------------------------------------------ | ----- |
| AC5 | No GITHUB_CLIENT_ID → local mode activated | 9.3   |
| AC6 | Local mode → user_id="local" auto-injected | 9.3   |

**Multi-tenant & Isolation:**

| AC  | Description                        | Story    |
| --- | ---------------------------------- | -------- |
| AC7 | User A can't see User B's DAGs     | 9.5      |
| AC8 | Rate limiting by user_id (cloud)   | 9.5      |
| AC9 | Account deletion → data anonymized | 9.4, 9.5 |

**MCP Config & Secrets (BYOK):**

| AC   | Description                              | Story |
| ---- | ---------------------------------------- | ----- |
| AC12 | User can configure API keys via Settings | 9.6   |
| AC13 | Keys encrypted at rest (AES-256-GCM)     | 9.6   |
| AC14 | MCP Gateway injects user's key at call   | 9.6   |
| AC15 | Secrets isolated by user_id              | 9.6   |

**MCP Gateway:**

| AC   | Description                                 | Story |
| ---- | ------------------------------------------- | ----- |
| AC10 | Valid API Key → user_id injected in context | 9.3   |
| AC11 | Invalid/missing API Key → 401 error         | 9.3   |

---

### Epic 9 Environment Variables

```bash
# Cloud mode - Required
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx
AUTH_REDIRECT_URL=http://localhost:8000/auth/callback

# Secrets encryption (Story 9.6) - Required for BYOK
SECRETS_MASTER_KEY=xxx  # 32 bytes, base64 encoded

# Self-hosted mode - Nothing required!
# If GITHUB_CLIENT_ID is not set → local mode automatic
```

---

### Epic 9 Dependencies

| Package              | Version  | Usage                    |
| -------------------- | -------- | ------------------------ |
| `jsr:@deno/kv-oauth` | latest   | GitHub OAuth             |
| `@ts-rex/argon2`     | latest   | Hash API Keys            |
| Drizzle ORM          | existing | Users schema             |
| Fresh 2.x            | existing | Routes + middleware + UI |

---

### Epic 9 FR Coverage

| FR   | Description                            | Story    |
| ---- | -------------------------------------- | -------- |
| FR1  | Détection automatique mode Cloud/Local | 9.3      |
| FR2  | GitHub OAuth authentication            | 9.2      |
| FR3  | User creation with GitHub profile      | 9.2      |
| FR4  | API Key generation/management          | 9.1, 9.2 |
| FR5  | Sessions 30 days (Deno KV)             | 9.2      |
| FR6  | Auth bypass mode local                 | 9.3      |
| FR7  | Rate limiting par user_id              | 9.5      |
| FR8  | Data isolation multi-tenant            | 9.5      |
| FR9  | Ownership tracking                     | 9.5      |
| FR10 | Landing page GitHub sign-in            | 9.4      |
| FR11 | Dashboard API Key display              | 9.4      |
| FR12 | API Key regeneration                   | 9.2, 9.4 |
| FR13 | Account deletion/anonymization         | 9.4, 9.5 |
| FR14 | MCP Gateway API Key validation         | 9.3      |
| FR15 | Protected routes dashboard/API         | 9.3      |
| FR16 | BYOK - User API keys for MCPs          | 9.6      |
| FR17 | Secrets encryption (AES-256-GCM)       | 9.6      |
| FR18 | MCP config via Dashboard               | 9.6      |
| FR19 | MCP Gateway key injection              | 9.6      |
