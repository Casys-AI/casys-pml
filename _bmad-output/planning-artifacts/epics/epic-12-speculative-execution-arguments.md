---
stepsCompleted: [
  "step-01-validate-prerequisites",
  "step-02-design-epics",
  "step-03-create-stories",
  "step-04-final-validation",
]
status: complete
inputDocuments:
  - docs/spikes/2025-12-18-speculative-execution-arguments.md
  - docs/epics/epic-10-dag-capability-learning-unified-apis.md
  - docs/epics/epic-11-learning-from-traces.md
---

# Procedural Memory Layer (PML) - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Epic 12: Speculative Execution with
Arguments, decomposing the requirements from the spike document into implementable stories.

### Clarification Terminologique (2025-12-22, mise à jour 2026-01-13)

| Concept         | Fonction               | Quand             | Algo              | Ce que c'est                                      |
| --------------- | ---------------------- | ----------------- | ----------------- | ------------------------------------------------- |
| **Speculation** | `speculateNextLayer()` | Intra-workflow    | Aucun (DAG connu) | Pré-exécuter les tasks connues du DAG             |
| **Prediction**  | `predictNextNode()`    | Post-workflow     | SHGAT + DR-DSP    | Prédire la prochaine action de l'utilisateur      |
| **Exploration** | `explorePath()`        | Intent inconnu    | DR-DSP + Dry-Run  | Tester des chemins hypothétiques non encore tracés |

**Distinction clé:**

- **Intra-workflow (Speculation)**: Le DAG est déjà défini (`static_structure`). On ne "prédit" rien, on
  pré-exécute les tasks connues pour gagner du temps.
- **Post-workflow (Prediction)**: L'utilisateur a terminé un workflow. Que va-t-il faire ensuite? ICI on a besoin
  de vraie prédiction (SHGAT + DR-DSP).
- **Exploration (NEW)**: L'intent ne match pas de capability existante. DR-DSP trouve un chemin hypothétique
  à travers le graphe, et on le teste via dry-run hybride (exécution réelle des safe tools + mock des unsafe).

### Vision Étendue (2026-01-13)

L'Epic 12 évolue d'un système de **speculation passive** (pré-exécuter ce qu'on connaît) vers un système
d'**exploration active** (découvrir de nouveaux chemins). L'objectif final est de permettre au système
d'**inférer sur des cas nouveaux** sans attendre qu'un utilisateur trace le chemin.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EPIC 12 PROGRESSION                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Phase 1: Foundation          Phase 2: Execution      Phase 3: Exploration  │
│  ───────────────────          ──────────────────      ─────────────────────  │
│                                                                              │
│  ┌─────────────────┐         ┌─────────────────┐     ┌─────────────────────┐│
│  │ 12.1 Context    │         │ 12.4 Hybrid     │     │ 12.8 Exploratory    ││
│  │ 12.2 Resolver   │────────▶│ 12.5 Cache      │────▶│      Dry-Run        ││
│  │ 12.3 Security   │         │ 12.6 Per-Layer  │     │                     ││
│  └─────────────────┘         │ 12.7 Learning   │     │ DR-DSP + Dry-Run    ││
│                              └─────────────────┘     │ = World Model       ││
│                                                      └─────────────────────┘│
│                                                                              │
│  Chemins CONNUS ──────────────────────────────────▶ Chemins HYPOTHÉTIQUES   │
│  (performance)                                       (découverte)           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Requirements Inventory

### Functional Requirements

FR1: Initialize WorkflowPredictionState.context with initial execution arguments at workflow start
FR2: Accumulate task results in context after each task execution (context[taskId] = result) FR3:
Resolve static argument definitions (from 10.2) to actual values at runtime (literal→value,
reference→context lookup, parameter→initial args) FR4: Generate real MCP tool calls in speculative
execution (replace placeholder) FR5: Implement security guards (`canSpeculate()`) based on tool
permissions FR6: Lookup ProvidesEdge at speculation time for field-to-field mappings FR7: Support
post-workflow capability prefetching for likely next capabilities FR8: Enable speculation during
per_layer validation pauses (when next layer is safe) FR9: Skip speculation only when argument
cannot be resolved (reference to unexecuted task OR missing parameter) FR10: Validate speculated
results against actual execution (cache hit/miss) FR11: Pass WorkerBridge to SpeculativeExecutor for
real calls (via RPC, 100% traçabilité)

### NonFunctional Requirements

NFR1: Speculative execution must not cause side effects (read-only tools only) NFR2: Speculation
cache should have configurable TTL (default 5 minutes) NFR3: Speculation should add minimal latency
to standard execution path NFR4: Security: If `requiresValidation()` returns true, NO speculation
allowed NFR5: Speculation results must be JSON-serializable for caching

### Exploration Requirements (NEW - 2026-01-13)

FR12: DR-DSP can find hypothetical paths for intents that don't match existing capabilities
FR13: Hybrid execution engine executes safe tools for real, mocks unsafe tools
FR14: Mock responses are configurable per tool or use schema-based defaults
FR15: Exploration traces are marked as `exploratory: true` and used for learning
FR16: Successful explorations can be promoted to validated capabilities
FR17: Failed explorations provide learning signal to SHGAT (negative examples)

NFR6: Exploration should be throttled to avoid resource exhaustion (max N concurrent explorations)
NFR7: Mock responses must be deterministic for reproducible testing

### Additional Requirements

**From Architecture (Epic 10/11 context):**

- **Story 10.2 (Static Argument Extraction) is prerequisite** - provides
  `static_structure.nodes[].arguments` with type info (literal/reference/parameter)
- **Story 10.3 (ProvidesEdge)** provides field mappings for data flow between tools
- `WorkflowPredictionState.context` already exists - just needs to be populated
- ~~`createToolExecutor(mcpClients)` already exists in `workflow-execution-handler.ts:112-122`~~
  **OBSOLÈTE:** Doit être modifié pour utiliser `WorkerBridge` (voir Story 10.5 Architecture
  Unifiée)

**From Spike Security Analysis:**

- Safe to speculate: `read_file`, `list_dir`, `search`, `parse_json`, `format`
- NOT safe: `github:push`, `write_file`, `delete_file`, `http POST/PUT/DELETE`
- Rule: Same criteria as `requiresValidation()` - if needs validation, no speculation

**From Spike Execution Modes:**

- Standard execution (high confidence): DAG runs to completion = implicit speculation
- per_layer execution: CAN speculate during checkpoint pause IF next layer is safe
- Post-workflow prefetch: Preload next likely capabilities after workflow completion

### FR Coverage Map

| FR   | Story   | Description                                          |
| ---- | ------- | ---------------------------------------------------- |
| FR1  | 12.1    | Initialize context with initial args                 |
| FR2  | 12.1    | Accumulate task results in context                   |
| FR3  | 12.2    | Resolve static args to runtime values                |
| FR4  | 12.4    | Generate real MCP tool calls                         |
| FR5  | 12.3    | Security guards (canSpeculate)                       |
| FR6  | 12.2    | ProvidesEdge field mappings                          |
| FR7  | 12.4    | Post-workflow prefetching                            |
| FR8  | 12.6    | per_layer speculation                                |
| FR9  | 12.2    | Skip when args unresolved                            |
| FR10 | 12.5    | Cache hit/miss validation                            |
| FR11 | 12.4    | Pass toolExecutor to SpeculativeExecutor             |
| FR12 | 12.8    | DR-DSP hypothetical path finding                     |
| FR13 | 12.8    | Hybrid execution (real safe + mock unsafe)           |
| FR14 | 12.8    | Configurable mock responses                          |
| FR15 | 12.8    | Exploratory traces for learning                      |
| FR16 | 12.8    | Promote explorations to validated capabilities       |
| FR17 | 12.8    | Failed explorations as negative learning signals     |

## Epic List

### Epic 12: Speculative Execution with Arguments

**Goal:** Permettre au système de pré-exécuter les prochains tools/capabilities avec les vrais
arguments, réduisant la latence à ~0ms sur cache hit tout en garantissant la sécurité (pas de side
effects).

**User Value:**

- L'agent AI obtient des résultats instantanés pour les outils prédits correctement
- Le système apprend des patterns d'exécution pour améliorer les prédictions
- Sécurité garantie: seuls les outils read-only sont spéculés

**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9, FR10, FR11

**NFRs addressed:** NFR1, NFR2, NFR3, NFR4, NFR5

**Dependencies:**

- Story 10.2 (Static Argument Extraction) - prerequisite
- Story 10.3 (ProvidesEdge) - prerequisite
- Story 10.5 (Architecture Unifiée WorkerBridge) - prerequisite

**Dependents (Stories qui utilisent Epic 12):**

- Story 10.7 AC16-17 (Speculation Automatique avec Session Context) - utilise Epic 12 pour:
  - Session Context Management (stockage résultats workflows précédents)
  - canSpeculate() (Story 12.3)
  - ProvidesEdge matching pour résolution automatique des arguments

---

## Epic 12: Speculative Execution with Arguments

> **⚠️ CLARIFICATION ARCHITECTURE (2025-12-19)**
>
> **Exécution spéculative:** Utilise le même chemin que l'exécution normale - **WorkerBridge RPC**.
>
> **Ce que cela signifie:**
>
> - `toolExecutor` dans Story 12.4 doit utiliser `WorkerBridge`, pas `client.callTool()` direct
> - Les résultats spéculatifs sont capturés via le même système de traces que Epic 11
> - 100% traçabilité, même pour l'exécution spéculative
>
> **Prérequis:** Story 10.5 (Architecture Unifiée) complétée. Voir:
> `docs/sprint-artifacts/10-5-execute-code-via-dag.md#architecture-unifiée-2025-12-19`

Permettre au système de pré-exécuter les prochains tools/capabilities avec les vrais arguments,
réduisant la latence à ~0ms sur cache hit tout en garantissant la sécurité (pas de side effects).

---

### Story 12.1: Context Initialization & Result Accumulation

**As a** speculative execution system, **I want** to store initial execution arguments and
accumulate task results in WorkflowPredictionState.context, **So that** I have all the data needed
to resolve arguments for speculative execution.

**FRs covered:** FR1, FR2

**Acceptance Criteria:**

**Given** a workflow is started with `pml_execute({ context: { path: "/file.txt" } })` **When** the
workflow execution begins **Then** `WorkflowPredictionState.context` is initialized with
`{ path: "/file.txt" }` **And** the initial arguments are accessible for parameter resolution

**Given** a task completes successfully with a result **When** the task execution ends **Then** the
result is stored in `context[taskId]` **And** the result is available for reference resolution in
subsequent predictions

**Given** a task fails with an error **When** the task execution ends **Then** the error is stored
in `context[taskId].error` **And** speculation is skipped for nodes depending on this task's output

**--- Data Sanitization (Runtime Results) ---**

**Given** MCP tool results are stored in context **When** sanitizing for storage **Then** sensitive
patterns (API keys, tokens) are redacted as `[REDACTED]` **And** non-JSON types (Date, BigInt) are
serialized properly **And** total payload > 10KB returns `{ _truncated: true, _originalSize: N }`
**Note:** Circular refs already handled by static analysis (Epic 10.1)

**Given** workflow completes successfully **When** persisting to execution_trace (Epic 11
dependency) **Then** `initial_context` is stored (sanitized) **And** `task_results[].args` and
`task_results[].result` are stored (sanitized)

**Files to create:**

- `src/utils/sanitize-for-storage.ts` - Sanitization utility (~50 LOC)

**Files to modify:**

- `src/speculation/speculative-executor.ts` - Add context initialization
- `src/dag/controlled-executor.ts` - Accumulate results after each task

**Epic 11 dependency:** Story 12.1 requires Epic 11.2 (`execution_trace` with `initial_context` and
`task_results[].args`)

**Estimation:** 1.5 jours

---

### Story 12.2: Argument Resolver

**As a** speculative execution system, **I want** to resolve static argument definitions (from Story
10.2) to actual runtime values, **So that** I can execute tools/capabilities speculatively with
correct arguments.

**FRs covered:** FR3, FR6, FR9

**Acceptance Criteria:**

**Given** a predicted node with `arguments: { path: { type: "literal", value: "config.json" } }`
**When** resolving arguments **Then** the resolved value is `{ path: "config.json" }`

**Given** a predicted node with
`arguments: { input: { type: "reference", expression: "task_0.content" } }` **When** resolving
arguments and `context["task_0"] = { content: "file data" }` **Then** the resolved value is
`{ input: "file data" }`

**Given** a predicted node with
`arguments: { filePath: { type: "parameter", parameterName: "path" } }` **When** resolving arguments
and initial context contains `{ path: "/my/file.txt" }` **Then** the resolved value is
`{ filePath: "/my/file.txt" }`

**Given** a reference argument pointing to an unexecuted task **When** resolving arguments **Then**
resolution returns `null` (skip speculation) **And** the prediction is marked as `unresolvable`

**Given** a parameter argument not provided in initial context **When** resolving arguments **Then**
resolution returns `null` (skip speculation)

**Given** tools connected by a ProvidesEdge with fieldMapping **When** resolving reference arguments
**Then** use fieldMapping to map `fromField` → `toField` correctly

**Files to create:**

- `src/speculation/argument-resolver.ts` (~150 LOC)

**Files to modify:**

- `src/graphrag/dag-suggester.ts` - Call resolver in `predictNextNodes()`

**Estimation:** 2 jours

---

### Story 12.3: Security Guard (canSpeculate)

**As a** speculative execution system, **I want** to verify that a tool/capability is safe to
execute speculatively, **So that** speculation never causes unintended side effects.

**FRs covered:** FR5 **NFRs addressed:** NFR1, NFR4

**Acceptance Criteria:**

**Given** a tool with `scope: "minimal"` and `approvalMode: "auto"` **When** checking
`canSpeculate(toolId)` **Then** returns `true` (safe to speculate)

**Given** a tool with `approvalMode: "hil"` (human-in-the-loop required) **When** checking
`canSpeculate(toolId)` **Then** returns `false` (not safe)

**Given** an unknown tool (not in `mcp-permissions.yaml`) **When** checking `canSpeculate(toolId)`
**Then** returns `false` (not safe - unknown tools require validation)

**Given** a tool that modifies external state (`github:push`, `write_file`, `delete_file`) **When**
checking `canSpeculate(toolId)` **Then** returns `false` (not safe)

**Given** a read-only tool (`read_file`, `list_dir`, `search`, `parse_json`) **When** checking
`canSpeculate(toolId)` **Then** returns `true` (safe)

**Given** `requiresValidation(toolId)` returns `true` **When** checking `canSpeculate(toolId)`
**Then** returns `false` (same criteria)

**Given** a capability containing only safe tools **When** checking `canSpeculate(capabilityId)`
**Then** returns `true`

**Given** a capability containing at least one unsafe tool **When** checking
`canSpeculate(capabilityId)` **Then** returns `false`

**Files to create:**

- `src/speculation/speculation-guard.ts` (~80 LOC)

**Files to modify:**

- `src/speculation/speculative-executor.ts` - Use guard before execution

**Estimation:** 1 jour

---

### Story 12.4: Real Speculative Execution

**As a** speculative execution system, **I want** to execute predicted tools/capabilities with real
MCP calls, **So that** results are cached and available instantly on prediction hit.

**FRs covered:** FR4, FR7, FR11 **NFRs addressed:** NFR3

**Acceptance Criteria:**

**Given** a predicted tool with resolved arguments and `canSpeculate() = true` **When** speculation
is triggered **Then** `toolExecutor(toolId, resolvedArgs)` is called via **WorkerBridge RPC**
**And** result is captured for caching **And** execution trace is captured (100% traçabilité)

**Given** a predicted capability with resolved arguments and `canSpeculate() = true` **When**
speculation is triggered **Then** capability code is executed in sandbox via **WorkerBridge** with
resolved args **And** result is captured for caching

**Given** `SpeculativeExecutor` is instantiated **When** initializing **Then** `WorkerBridge`
instance is injected (NOT direct `mcpClients`) **And** real MCP calls go through Worker RPC proxy

**Given** `generateSpeculationCode()` is called **When** generating execution code **Then** returns
actual tool/capability invocation (not preparation metadata)

**--- Trigger: Intra-Workflow (speculation sur DAG connu) ---**

**Given** a task completes within a workflow **When** `onTaskComplete(task, result)` fires **Then**
`speculateNextLayer()` is called (PAS de prédiction - DAG connu) **And** next layer tasks from
`static_structure` are pre-executed if safe

**Note:** Intra-workflow = pré-exécution du DAG connu, pas de SHGAT/DR-DSP.

**--- Trigger: Post-Workflow (vraie prédiction) ---**

**Given** a workflow completes successfully **When** `onWorkflowComplete(workflowResult)` fires
**Then** `predictNextNode()` is called (SHGAT + DR-DSP - Story 10.7a/b) **And** predicted
capabilities are speculatively executed with workflow context **And** results cached for instant
response si l'utilisateur demande

**Note:** Post-workflow = vraie prédiction. Utilise les algos de 10.7a/b.

**--- Deux mécanismes distincts ---**

| Trigger           | Fonction               | Input           | Algo              |
| ----------------- | ---------------------- | --------------- | ----------------- |
| Task complete     | `speculateNextLayer()` | DAG + context   | Aucun (DAG connu) |
| Workflow complete | `predictNextNode()`    | Workflow result | SHGAT + DR-DSP    |

**Given** speculation/prediction returns candidates **When** executing speculatively **Then** same
execution logic handles both:

- Resolve arguments from context
- Check `canSpeculate()`
- Execute via `WorkerBridge`
- Cache result

**Files to modify:**

- `src/speculation/speculative-executor.ts` - Replace placeholder, inject **WorkerBridge** (not
  mcpClients) (~100 LOC)
- `src/dag/controlled-executor.ts` - Add `onTaskComplete` trigger
- `src/mcp/handlers/workflow-execution-handler.ts` - Add `onWorkflowComplete` trigger

**Note:** Requires Story 10.5 "Architecture Unifiée" to be completed first (WorkerBridge integration
in ControlledExecutor).

**Estimation:** 3 jours

---

### Story 12.5: Speculation Cache & Validation

**As a** speculative execution system, **I want** to cache speculated results and validate them
against actual execution, **So that** I can serve instant results on cache hit and learn from
prediction accuracy.

**FRs covered:** FR10 **NFRs addressed:** NFR2, NFR5

**Acceptance Criteria:**

**Given** a speculative execution completes successfully **When** storing result **Then** result is
cached with key `{ toolId/capabilityId, argsHash }` **And** TTL is applied (configurable, default 5
minutes)

**Given** actual execution is requested for a tool/capability **When** checking cache **Then**
lookup uses same key `{ toolId/capabilityId, argsHash }`

**Given** cache hit with matching args **When** serving result **Then** cached result is returned
immediately (~0ms latency) **And** actual execution is skipped

**Given** cache hit but args differ **When** validating **Then** cache miss, execute normally
**And** update cache with new result

**Given** cache miss (no speculated result) **When** execution completes **Then** result is NOT
cached (only speculated results are cached)

**--- Validation & Learning ---**

**Given** speculation was correct (cache hit used) **When** tracking metrics **Then** increment
`speculation_hits` counter **And** record prediction confidence for learning

**Given** speculation was wrong (cache miss or different result) **When** tracking metrics **Then**
increment `speculation_misses` counter **And** log prediction details for analysis

**--- Serialization ---**

**Given** a speculated result **When** caching **Then** result is JSON-serializable **And** circular
references are handled (error or sanitized)

**Given** cache TTL expires **When** accessing cached result **Then** returns cache miss **And**
entry is evicted

**Files to create:**

- `src/speculation/speculation-cache.ts` (~100 LOC)

**Files to modify:**

- `src/speculation/speculative-executor.ts` - Integrate cache
- `src/graphrag/metrics/collector.ts` - Add speculation metrics

**Estimation:** 2 jours

---

### Story 12.6: Per-Layer Speculation

**As a** speculative execution system, **I want** to speculatively execute the next layer during
per_layer validation pauses, **So that** results are ready instantly when the agent continues.

**FRs covered:** FR8

**Note terminologique:** Cette story utilise `speculateNextLayer()` (pas `predictNextNode()`) car le
DAG est connu - on pré-exécute, on ne prédit pas.

**Acceptance Criteria:**

**Given** workflow running with `per_layer_validation: true` **When** a layer completes and
checkpoint pause begins **Then** `speculateNextLayer()` is called (DAG connu, pas de prédiction)
**And** safe nodes from next layer are pre-executed during the pause

**Given** checkpoint pause with next layer containing safe tools only **When** speculation runs
**Then** all next layer nodes are speculatively executed **And** results are cached

**Given** checkpoint pause with next layer containing unsafe tool **When** speculation runs **Then**
only safe tools in next layer are speculatively executed **And** unsafe tools are skipped (await
actual execution)

**Given** agent calls `pml_continue(workflow_id)` **When** resuming execution **Then** check cache
for next layer results **And** serve cached results on hit (instant)

**Given** agent calls `pml_replan(workflow_id, newDag)` **When** DAG is modified during pause
**Then** invalidate speculated results for old next layer **And** optionally speculate new next
layer

**--- Integration with AIL ---**

**Given** AIL is enabled with `decision_points: "per_layer"` **When** decision_required event fires
**Then** speculation can run in parallel with agent decision **And** if agent chooses "continue",
results are ready

**Given** agent chooses "abort" or "replan" **When** speculation was running **Then** speculated
results are discarded **And** no side effects occurred (safe tools only)

**Files to modify:**

- `src/dag/controlled-executor.ts` - Add speculation trigger on checkpoint
- `src/mcp/handlers/workflow-execution-handler.ts` - Integrate with per_layer flow
- `src/speculation/speculative-executor.ts` - Handle layer-based speculation

**Estimation:** 2 jours

---

## Epic 12 Summary

| Story | Titre                                        | FRs            | Estimation |
| ----- | -------------------------------------------- | -------------- | ---------- |
| 12.1  | Context Initialization & Result Accumulation | FR1, FR2       | 1.5j       |
| 12.2  | Argument Resolver                            | FR3, FR6, FR9  | 2j         |
| 12.3  | Security Guard (canSpeculate)                | FR5            | 1j         |
| 12.4  | Real Speculative Execution                   | FR4, FR7, FR11 | 3j         |
| 12.5  | Speculation Cache & Validation               | FR10           | 2j         |
| 12.6  | Per-Layer Speculation                        | FR8            | 2j         |
| 12.7  | Argument-Aware Learning                      | (ext FR2)      | 2-3j       |

**Total Epic 12: ~14 jours**

**Dependencies:**

```
Epic 10.2 (Static Argument Extraction) ──┐
Epic 10.3 (ProvidesEdge) ────────────────┼──→ 12.1 → 12.2 → 12.3 → 12.4 → 12.5
Epic 10.5 (Architecture Unifiée) ────────┤                            ↓
Epic 11.2 (execution_trace) ─────────────┘                          12.6

Note: Story 10.5 est CRITIQUE - sans WorkerBridge, pas de traçabilité des exécutions spéculatives.
```

---

### Story 12.7: Argument-Aware Learning

**As a** learning system, **I want** to learn from argument patterns in execution traces, **So
that** SHGAT can predict success/failure based on argument types and values.

**FRs covered:** (extension de FR2) **NFRs addressed:** NFR5 (JSON-serializable)

**Context utilisé:** `initialContext` + `taskResults[].args`

**Ce qu'on apprend:**

- "Quand args.path = *.json → 90% succès"
- "Quand args.channel = #prod → plus de risque d'échec"
- Patterns d'arguments qui influencent le succès

**Acceptance Criteria:**

**Given** execution traces with `taskResults[].args` stored **When** extracting argument features
**Then** `ArgumentPattern` is computed for each trace **And** patterns are stored for learning

**Given** a set of traces with argument patterns **When** training SHGAT **Then** argument features
influence the training **And** SHGAT can predict better based on arg types

**Given** a new execution with similar arguments to past successes **When** SHGAT scores
capabilities **Then** score is boosted by argument pattern match

**Dépendances:**

- Story 12.1 (Context Initialization) - stocke `initial_context`
- Story 12.2 (Argument Resolver) - résout les args

**Files to create:**

- `src/graphrag/learning/argument-features.ts` (~100 LOC)

**Files to modify:**

- `src/graphrag/learning/per-training.ts` - Integrate argument features
- `src/graphrag/algorithms/shgat.ts` - Accept argument features in training

**Implementation notes:**

```typescript
interface ArgumentPattern {
  hasFilePath: boolean; // args contient un path
  fileExtension?: string; // .json, .xml, .txt
  hasChannelRef: boolean; // args contient un channel
  argCount: number; // nombre d'arguments
}

// Feature engineering sur les args pour enrichir le training
function extractArgumentFeatures(args: Record<string, JsonValue>): ArgumentPattern;
```

**Estimation:** 2-3 jours

---

### Story 12.8: Exploratory Dry-Run (Capstone)

**As a** PML system, **I want** to explore hypothetical capability paths via DR-DSP and validate them
using hybrid dry-run execution (real safe tools + mocked unsafe tools), **So that** I can infer on
new cases without waiting for a user to trace the path first.

**FRs covered:** FR12, FR13, FR14, FR15, FR16, FR17
**NFRs addressed:** NFR1, NFR6, NFR7

**Context:** Cette story est le point culminant de l'Epic 12 - elle transforme PML d'un système
réactif (qui apprend des traces passées) en un système proactif (qui explore de nouvelles possibilités).

**Acceptance Criteria:**

**--- Path Discovery ---**

**Given** an intent that doesn't match any existing capability with high confidence
**When** `explorePath(intent)` is called
**Then** DR-DSP finds hypothetical paths through the tool/capability graph
**And** returns candidate paths ranked by estimated viability

**Given** DR-DSP returns multiple candidate paths
**When** selecting paths to explore
**Then** prioritize paths with:
  - More safe (speculatable) tools
  - Higher historical success rate for similar tools
  - Shorter path length (Occam's razor)

**--- Hybrid Execution ---**

**Given** a candidate path with mixed safe/unsafe tools
**When** executing in dry-run mode
**Then** safe tools (`canSpeculate() = true`) execute for real via WorkerBridge
**And** unsafe tools (`canSpeculate() = false`) return mock responses
**And** execution flow continues through the entire path

**Given** a tool marked as unsafe
**When** generating mock response
**Then** use configured mock if available in `dryRunMocks[toolId]`
**Or** generate schema-based mock from tool's output schema
**Or** return `{ _mocked: true, toolId, reason: "unsafe" }`

**Given** exploration execution completes
**When** generating trace
**Then** trace is marked with `exploratory: true`
**And** each task result indicates `mocked: boolean`
**And** trace is stored for learning

**--- Validation & Learning ---**

**Given** exploration completes without errors
**When** evaluating path viability
**Then** path is marked as `viable: true`
**And** confidence score is computed based on:
  - % of real vs mocked executions
  - Success of real tool calls
  - Coherence of data flow between tools

**Given** exploration fails (error in real tool or invalid data flow)
**When** evaluating path
**Then** path is marked as `viable: false`
**And** failure point is recorded for SHGAT negative learning

**Given** a viable exploration path
**When** user later requests similar intent
**Then** SHGAT can score this path higher (learned from exploration)
**And** system can suggest the explored path with confidence

**Given** repeated successful explorations of a path
**When** confidence exceeds threshold
**Then** path can be promoted to a "validated capability"
**And** available for direct suggestion without dry-run

**--- API ---**

```typescript
interface ExploreResult {
  intent: string;
  pathsExplored: number;
  viablePaths: Array<{
    path: string[];           // tool/capability IDs
    confidence: number;       // 0-1
    realExecutions: number;   // count of real tool calls
    mockedExecutions: number; // count of mocked calls
    result: JsonValue;        // final output (may contain mocked data)
  }>;
  failedPaths: Array<{
    path: string[];
    failurePoint: string;     // tool ID where it failed
    error: string;
  }>;
  trace: ExecutionTrace;      // full trace for learning
}

// API call
const result = await pml_explore({
  intent: "Convert CSV to JSON and validate schema",
  maxPaths: 3,              // max paths to explore
  maxDepth: 5,              // max path length
  mockConfig: {             // optional custom mocks
    "write_file": { success: true, path: "/mock/output.json" }
  }
});
```

**--- Throttling & Safety ---**

**Given** multiple exploration requests
**When** system is under load
**Then** explorations are queued with max concurrency (default: 2)
**And** exploration timeout applies (default: 30s per path)

**Given** exploration detects infinite loop or circular dependency
**When** path exceeds maxDepth
**Then** exploration is aborted for that path
**And** partial results are returned

**Dependencies:**

- Story 12.3 (Security Guard) - `canSpeculate()` determines safe vs unsafe
- Story 12.4 (Real Speculative Execution) - execution infrastructure
- Story 12.5 (Speculation Cache) - cache real tool results
- DR-DSP algorithm (existing) - path finding

**Files to create:**

- `src/exploration/explorer.ts` - Main exploration orchestrator (~200 LOC)
- `src/exploration/mock-engine.ts` - Mock response generator (~100 LOC)
- `src/exploration/path-evaluator.ts` - Viability scoring (~80 LOC)

**Files to modify:**

- `src/graphrag/algorithms/dr-dsp.ts` - Add `findHypotheticalPaths()` mode
- `src/mcp/handlers/pml-handler.ts` - Add `pml_explore` endpoint
- `src/graphrag/learning/per-training.ts` - Learn from exploratory traces

**Implementation notes:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        EXPLORATORY DRY-RUN FLOW                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Intent ──▶ DR-DSP ──▶ Candidate Paths ──▶ For each path:                   │
│                              │                                               │
│                              ▼                                               │
│                    ┌─────────────────────┐                                   │
│                    │   For each tool:    │                                   │
│                    │                     │                                   │
│                    │  canSpeculate()?    │                                   │
│                    │     │       │       │                                   │
│                    │    YES     NO       │                                   │
│                    │     │       │       │                                   │
│                    │     ▼       ▼       │                                   │
│                    │   REAL    MOCK      │                                   │
│                    │  execute  response  │                                   │
│                    │     │       │       │                                   │
│                    │     └───┬───┘       │                                   │
│                    │         │           │                                   │
│                    │    Next tool        │                                   │
│                    └─────────────────────┘                                   │
│                              │                                               │
│                              ▼                                               │
│                    ┌─────────────────────┐                                   │
│                    │  Evaluate viability │                                   │
│                    │  - % real vs mock   │                                   │
│                    │  - errors?          │                                   │
│                    │  - data flow ok?    │                                   │
│                    └─────────────────────┘                                   │
│                              │                                               │
│                              ▼                                               │
│                    ┌─────────────────────┐                                   │
│                    │  Store trace        │                                   │
│                    │  Learn from result  │                                   │
│                    │  Return to user     │                                   │
│                    └─────────────────────┘                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Relation to World Models / JEPA:**

Cette story transforme PML en un système qui peut "imaginer" des exécutions:
- **World Model analogy**: DR-DSP = planning, Hybrid execution = simulation
- **JEPA analogy**: On prédit les représentations intermédiaires (outputs de chaque tool)
  et on valide la cohérence du chemin sans nécessairement tout exécuter pour de vrai

La différence clé: on ne génère pas les outputs via un modèle génératif, on utilise
soit l'exécution réelle (safe tools) soit des mocks basés sur les schemas.

**Estimation:** 4-5 jours

---

### Story 12.9: Mock Registry & Exploration Learning (Research)

**As a** learning system, **I want** to maintain a registry of realistic mocks curated automatically
from execution outcomes, **So that** exploratory dry-runs use high-quality mocks and SHGAT learns
effectively from exploration traces.

**FRs covered:** FR14 (extended), FR15, FR17
**NFRs addressed:** NFR7

> **⚠️ REQUIRES INVESTIGATION**
>
> Cette story nécessite une phase de spike/investigation avant implémentation.
> L'apprentissage via chemins explorés avec mocks est un sujet non étudié.

**Context:** Story 12.8 génère des traces "exploratoires" avec un mix d'exécutions réelles (safe
tools) et de mocks (unsafe tools). Cette story traite:
1. Comment stocker et curer les mocks de manière persistante
2. Comment SHGAT apprend des traces partiellement mockées
3. Comment auto-déprécier les mauvais mocks via les error types

**Investigation Areas:**

**1. Mock Registry Architecture**

Remplacer le cache temporaire par un registre persistant:

```
Questions ouvertes:
- Table DB dédiée `mock_registry` ou extension de `capability_cache`?
- Granularité: par tool exact ou par pattern d'arguments?
- Versioning des mocks quand le tool évolue?
```

**2. Auto-Curation via Error Types**

Réutiliser l'infrastructure existante (migration 024, trace-feature-extractor):

```
Pistes:
- error_type = VALIDATION → mock a mauvaise shape → déprécier fortement
- error_type = NOT_FOUND → mock référence ressource stale → marquer obsolète
- error_type = NETWORK/TIMEOUT/PERMISSION → pas la faute du mock → ignorer

Existant à connecter:
- classifyErrorType() dans migration 024
- queryErrorTypeAffinity() dans trace-feature-extractor.ts
- errorRecoveryRate déjà calculé par tool
```

**3. Learning from Exploration Traces**

Comment SHGAT traite les traces avec mocks:

```
Questions ouvertes:
- Pondération: trace 100% réelle vs trace 50% mockée?
- Les mocks introduisent-ils du bruit dans l'embedding?
- Faut-il un flag séparé dans TrainingExample pour `mockRatio`?
- Seuil minimum de % réel pour considérer la trace valide?

Hypothèses à tester:
- H1: Traces avec >70% réel donnent un bon signal
- H2: Mocks canonical (validés) n'ajoutent pas de bruit
- H3: Error-based curation améliore la qualité du learning
```

**4. Promotion Workflow**

Quand un mock devient "canonical" (référence):

```
Pistes:
- successCount >= N && failureCount == 0 → promote
- Ou: successRate > 0.9 avec minSamples >= 5
- Canonical mocks pourraient avoir poids 1.0 dans learning
- Non-canonical mocks auraient poids réduit (0.5?)
```

**Acceptance Criteria (Post-Investigation):**

À définir après le spike. Critères probables:
1. Mock Registry persiste les résultats réels pour réutilisation
2. Auto-curation basée sur downstream error_type
3. SHGAT training accepte `mockRatio` comme feature/weight
4. Métriques: mock hit rate, curation accuracy, learning impact

**Dependencies:**

- Story 12.5 (Speculation Cache) - base infrastructure
- Story 12.8 (Exploratory Dry-Run) - génère les traces
- Migration 024 (error_type) - classification erreurs
- trace-feature-extractor.ts - errorTypeAffinity existant

**Spike Deliverables:**

1. ADR documentant l'architecture choisie
2. Benchmark comparant learning avec/sans mocks
3. Prototype de la curation automatique

**Estimation:** 3-4 jours (spike) + 3-4 jours (implémentation) = ~7 jours

---

### Story 12.10: Exploration Results & LLM Selection

**As a** PML system, **I want** to return ranked exploration results with sufficient context for an
LLM (Claude) to make an informed path selection, **So that** the final decision leverages both
PML's exploration data and Claude's semantic understanding.

**FRs covered:** (extension FR12, FR16)
**NFRs addressed:** NFR3

> **⚠️ RESPONSE FORMAT TBD**
>
> Le format exact de la réponse à Claude sera défini lors de l'implémentation.
> Cette story pose le cadre architectural.

**Context:** Story 12.8 explore plusieurs chemins hypothétiques. Le problème: comment choisir
le meilleur chemin quand les unsafe tools sont mockés ? On ne peut pas vraiment évaluer la
qualité du résultat final.

**Solution:** Ne pas choisir automatiquement. Retourner les résultats d'exploration à Claude
avec suffisamment de contexte pour qu'il décide.

**Acceptance Criteria:**

**--- Response Structure ---**

**Given** `pml_explore()` finds multiple viable paths
**When** returning results
**Then** each path includes:
  - Path composition (tool/capability IDs)
  - Real vs mocked execution breakdown
  - Actual outputs from real tool executions (les vrais résultats intermédiaires)
  - Mock outputs clearly marked
  - Historical success rates per tool
  - Computed confidence score
  - Any warnings or partial failures

**Given** exploration returns paths to Claude
**When** Claude evaluates options
**Then** Claude has access to:
  - Les données réelles produites par les safe tools
  - Le contexte sémantique de l'intent original
  - Les métriques de fiabilité historique

**--- Selection Flow ---**

**Given** Claude selects a path from exploration results
**When** confirming execution
**Then** `pml_execute({ explorePath: pathId, confirm: true })` triggers full real execution
**And** the previously mocked tools are now executed for real
**And** results are cached and traced

**Given** Claude rejects all paths
**When** no suitable path found
**Then** Claude can request more exploration with different parameters
**Or** inform user that no viable path exists

**--- Learning from Selection ---**

**Given** Claude selects path A over path B
**When** tracking the decision
**Then** selection is recorded as implicit feedback
**And** SHGAT can learn that path A was preferred for this intent type

**Given** selected path execution succeeds
**When** updating learning
**Then** path confidence is boosted for similar intents

**Given** selected path execution fails
**When** updating learning
**Then** exploration was misleading → investigate why (mock quality? tool changed?)

**Investigation Areas:**

```
Questions ouvertes (à définir lors de l'implémentation):

1. Format de réponse
   - JSON structuré vs markdown pour Claude?
   - Niveau de détail des outputs intermédiaires?
   - Truncation pour les gros payloads?

2. Quels outputs inclure
   - Tous les outputs réels ou résumé?
   - Schema des outputs pour contexte?
   - Diff entre paths si outputs similaires?

3. Métriques de ranking
   - Score composite ou métriques séparées?
   - Comment présenter le mockRatio?
   - Historique de succès: granularité?

4. Confirmation flow
   - Re-exécuter tout ou juste les mocked?
   - Utiliser le cache des real executions?
   - Timeout/expiration des explorations?
```

**Dependencies:**

- Story 12.8 (Exploratory Dry-Run) - génère les paths
- Story 12.9 (Mock Registry) - qualité des mocks

**Files to modify:**

- `src/exploration/explorer.ts` - Structure de retour enrichie
- `src/mcp/handlers/pml-handler.ts` - Endpoint avec format LLM-friendly

**Estimation:** 2-3 jours

---

## Epic 12 Summary (Updated)

| Story | Titre                                        | FRs                 | Phase       | Estimation |
| ----- | -------------------------------------------- | ------------------- | ----------- | ---------- |
| 12.1  | Context Initialization & Result Accumulation | FR1, FR2            | Foundation  | 1.5j       |
| 12.2  | Argument Resolver                            | FR3, FR6, FR9       | Foundation  | 2j         |
| 12.3  | Security Guard (canSpeculate)                | FR5                 | Foundation  | 1j         |
| 12.4  | Real Speculative Execution                   | FR4, FR7, FR11      | Execution   | 3j         |
| 12.5  | Speculation Cache & Validation               | FR10                | Execution   | 2j         |
| 12.6  | Per-Layer Speculation                        | FR8                 | Execution   | 2j         |
| 12.7  | Argument-Aware Learning                      | (ext FR2)           | Learning    | 2-3j       |
| 12.8  | **Exploratory Dry-Run (Capstone)**           | FR12-17             | Exploration | 4-5j       |
| 12.9  | **Mock Registry & Exploration Learning** ⚠️  | FR14-15, FR17       | Research    | ~7j        |
| 12.10 | **Exploration Results & LLM Selection**      | (ext FR12, FR16)    | Integration | 2-3j       |

**Total Epic 12: ~28-30 jours**

> ⚠️ Story 12.9 requiert un spike avant implémentation
> ⚠️ Story 12.10 format de réponse TBD

**Dependency Graph (Updated):**

```
Epic 10.2 (Static Argument Extraction) ──┐
Epic 10.3 (ProvidesEdge) ────────────────┼──→ 12.1 → 12.2 → 12.3 ──┐
Epic 10.5 (Architecture Unifiée) ────────┤                         │
Epic 11.2 (execution_trace) ─────────────┘                         ▼
                                                            12.4 → 12.5
                                                              │      │
                                                              ▼      │
                                                            12.6 ◄───┘
                                                              │
                                                              ▼
                                                            12.7
                                                              │
                                                              ▼
                                                    ┌─────────────────┐
                                                    │ 12.8 Exploratory│
DR-DSP (existing) ─────────────────────────────────▶│    Dry-Run      │
                                                    │   (Capstone)    │
                                                    └────────┬────────┘
                                                             │
                                                             ▼
Migration 024 (error_type) ───────────────┐       ┌─────────────────┐
trace-feature-extractor.ts ───────────────┼──────▶│ 12.9 Mock Reg.  │
                                          │       │  & Exploration  │
                                          │       │   Learning ⚠️   │
                                          │       └────────┬────────┘
                                          │                │
                                          │                ▼
                                          │       ┌─────────────────┐
                                          └──────▶│ 12.10 Results   │
                                                  │  & LLM Select   │
                                                  └─────────────────┘
                                                         │
                                                         ▼
                                                  Claude choisit
                                                  le meilleur path
```

---

## Epic 11 Updates Required

Pour supporter Epic 12 (post-workflow speculation), Epic 11.2 doit inclure:

**Nouveau champ dans `execution_trace`:**

```sql
ALTER TABLE execution_trace ADD COLUMN initial_context JSONB DEFAULT '{}';
```

**Structure enrichie de `task_results`:**

```typescript
// JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
task_results: [
  {
    taskId: string,
    tool: string,
    args: Record<string, JsonValue>, // ← NOUVEAU
    result: JsonValue,
    success: boolean,
    durationMs: number,
  },
];
```

**Data Sanitization (shared utility):**

- `src/utils/sanitize-for-storage.ts` - utilisé par Epic 11 ET Epic 12
- Redact sensitive data, truncate large payloads, handle circular refs

---

## Architecture Decision Records (ADRs) - Epic 12

### ADR-12.1: Unified Speculation Mechanism

**Decision:** Mécanisme unifié pour intra-workflow et post-workflow speculation.

**Rationale:**

- Même flow: resolve args → canSpeculate → execute → cache
- Seule différence: source de prédiction (DAG vs patterns)
- Réduit duplication et surface de bugs

### ADR-12.2: Storage Strategy

**Decision:** Utiliser `execution_trace` de Epic 11 (PostgreSQL).

**Rationale:**

- Epic 11 stocke déjà `task_results`
- Ajout de `initial_context` et `task_results[].args` suffisant
- Pas de duplication, données disponibles pour learning ET speculation

### ADR-12.3: Security Model

**Decision:** Réutiliser `requiresValidation()` pour `canSpeculate()`.

**Rationale:**

- Logique déjà implémentée et testée
- Cohérence: si HIL requis → pas de speculation
- Pas de nouveau schema à maintenir

### ADR-12.4: Confidence Threshold

**Decision:** Réutiliser `AdaptiveThresholdManager` existant.

**Rationale:**

- Déjà implémenté (`src/mcp/adaptive-threshold.ts`)
- Apprend des false positives/negatives
- `SpeculationManager` l'utilise déjà

### ADR-12.5: Argument Resolution

**Decision:** 3-type resolution avec skip si non résolvable.

| Type        | Source                     | Fallback |
| ----------- | -------------------------- | -------- |
| `literal`   | static_structure           | N/A      |
| `reference` | context[taskId].result     | Skip     |
| `parameter` | initial_context[paramName] | Skip     |

### ADR-12.6: Data Sanitization

**Decision:** Shared utility pour Epic 11 et 12.

- Circular refs: Handled by static analysis (Epic 10.1)
- Sensitive data: Redact patterns (API keys, tokens)
- Large payloads: Truncate > 10KB
- Non-JSON types: Serialize properly

### ADR-12.7: Exploratory Dry-Run Architecture (NEW - 2026-01-13)

**Decision:** Hybrid execution model - real execution for safe tools, mocks for unsafe tools.

**Context:** Le système doit pouvoir explorer des chemins hypothétiques (non encore tracés) pour
faire de l'inférence sur des cas nouveaux. Deux approches possibles:

1. **Full Mock**: Tout mocker, rapide mais données fictives
2. **Full Real**: Tout exécuter, données réelles mais side-effects possibles
3. **Hybrid**: Real pour safe, mock pour unsafe ← **CHOIX**

**Rationale:**

- Maximise les données réelles (meilleur apprentissage)
- Zéro side-effects garantis (réutilise `canSpeculate()`)
- Traces exploratoires utilisables pour SHGAT
- Permet de valider la viabilité réelle d'un chemin

**Alternatives considérées:**

| Approche     | Données     | Sécurité    | Apprentissage | Complexité |
| ------------ | ----------- | ----------- | ------------- | ---------- |
| Full Mock    | Fictives    | ✅ Safe     | ❌ Limité     | Faible     |
| Full Real    | Réelles     | ❌ Risqué   | ✅ Optimal    | Faible     |
| **Hybrid**   | **Mixtes**  | **✅ Safe** | **✅ Bon**    | Moyenne    |

**Conséquences:**

- Les traces exploratoires doivent marquer `mocked: boolean` par task
- SHGAT doit pondérer différemment les exemples avec mocks
- La confidence d'un chemin dépend du ratio real/mock
- Mocks doivent être déterministes pour reproductibilité

### ADR-12.8: Mock Response Strategy

**Decision:** Cascade de mock sources: configured → schema-based → minimal.

**Rationale:**

```
1. dryRunMocks[toolId]     → Mock configuré par l'utilisateur (prioritaire)
2. tool.outputSchema       → Génère mock depuis le JSON Schema
3. { _mocked: true, ... }  → Fallback minimal
```

- Permet aux utilisateurs de fournir des mocks réalistes
- Fallback automatique basé sur les schemas MCP
- Toujours un résultat, jamais de blocage

### ADR-12.9: Exploration as Learning Signal

**Decision:** Les explorations (succès ET échecs) alimentent SHGAT.

**Rationale:**

- **Succès**: Chemin viable, booste le score pour intents similaires
- **Échec**: Chemin non-viable, signal négatif pour SHGAT
- Permet l'apprentissage proactif sans attendre les utilisateurs

**Implications pour SHGAT:**

- Nouveau champ `trace.exploratory: boolean`
- Poids réduit pour exemples avec beaucoup de mocks
- Exemples exploratoires marqués distinctement dans training
