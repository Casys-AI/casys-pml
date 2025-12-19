# Story 10.5: Execute Code via Inferred DAG

Status: in-progress

> **⚠️ REFACTORING NEEDED (2025-12-19)**
>
> L'implémentation actuelle a un problème architectural :
> - `createToolExecutor()` appelle `client.callTool()` directement
> - Cela bypasse le Worker RPC et perd 100% de traçabilité
>
> **Action requise:** Modifier les handlers pour utiliser `WorkerBridge`
> au lieu d'appels MCP directs. Voir section "Architecture Unifiée".

> **Epic:** 10 - DAG Capability Learning & Unified APIs
> **Tech-Spec:** [tech-spec-dag-capability-learning.md](../tech-specs/tech-spec-dag-capability-learning.md)
> **Prerequisites:** Story 10.1 (Static Structure Builder - DONE), Story 10.2 (Argument Extraction - DONE)
> **Depends on:** ControlledExecutor (Epic 2.5), static_structure types

---

## Story

As an execution system,
I want to execute code via its inferred DAG structure,
So that code execution benefits from DAG features (per-layer validation, parallel execution, checkpoints, SSE streaming).

---

## Context & Problem

**Le gap actuel:**

Story 10.1 génère `static_structure` (le DAG inféré du code), mais `execute_code` ne l'utilise pas:

```
ACTUEL:
Code → DenoSandboxExecutor (exécution directe) → Result
        ↓
     static_structure stocké (juste pour learning/viz)

SOUHAITÉ:
Code → static_structure → DAGStructure → ControlledExecutor → Result
                                              ↓
                          per_layer, parallel, checkpoints, SSE
```

**Pourquoi c'est important:**

| Feature | execute_code actuel | execute_dag | Après cette story |
|---------|---------------------|-------------|-------------------|
| Per-layer validation (HIL) | ❌ | ✅ | ✅ |
| Parallel execution | ❌ | ✅ | ✅ |
| Checkpoints/resume | ❌ | ✅ | ✅ |
| SSE streaming | ❌ | ✅ | ✅ |
| Safe-to-fail branches | ❌ | ✅ | ✅ |
| Capability learning | ✅ | ❌ | ✅ |

**Code-first principle:**
L'IA écrit du code TypeScript. Le système infère le DAG et l'exécute avec toutes les features.

---

## Acceptance Criteria

### AC1: StaticStructure to DAGStructure Converter ✅
- [x] Create `staticStructureToDag(structure: StaticStructure): DAGStructure`
- [x] Map `StaticStructureNode` → `Task`:
  - `type: "task"` → `Task { tool, arguments, type: "mcp_tool" }`
  - `type: "capability"` → `Task { capabilityId, type: "capability" }`
  - `type: "decision"` → Handle via conditional edges
  - `type: "fork/join"` → Set `dependsOn` for parallelism
- [x] Map `StaticStructureEdge` → `Task.dependsOn`:
  - `type: "sequence"` → Direct dependency
  - `type: "conditional"` → Conditional execution (skip if condition false)
  - `type: "provides"` → Data flow dependency

### AC2: Code Execution Handler Uses DAG ✅
- [x] Modify `handleExecuteCode()` to:
  1. Build `static_structure` via `StaticStructureBuilder`
  2. Convert to `DAGStructure` via `staticStructureToDag()`
  3. Execute via `ControlledExecutor` instead of `DenoSandboxExecutor`
  4. Return unified response format

### AC3: Arguments Resolution at Runtime ✅
- [x] For each task in DAG:
  - `ArgumentValue.type = "literal"` → Use value directly
  - `ArgumentValue.type = "reference"` → Resolve from previous task result
  - `ArgumentValue.type = "parameter"` → Extract from execution context
- [x] Create `resolveArguments(args: ArgumentsStructure, context: ExecutionContext): Record<string, unknown>`

### AC4: Conditional Execution Support ✅
- [x] Decision nodes create conditional branches in DAG
- [x] At runtime, evaluate condition and skip/include tasks
- [x] Support `outcome: "true" | "false"` for if/else branches

### AC5: Parallel Execution from Fork/Join ✅
- [x] Fork nodes → tasks without dependencies (parallel)
- [x] Join nodes → task depends on all fork children
- [x] Preserve parallel execution speedup

### AC6: Per-Layer Validation for Code ✅
- [x] Code execution now gets per-layer validation via ControlledExecutor
- [x] HIL approval for tools with elevated permissions (via existing escalation handler)
- [x] Reuse existing `requiresValidation()` logic via ControlledExecutor

### AC7: ~~Fallback to Direct Execution~~ → Unified Execution ⚠️
- [ ] ~~If `static_structure` is empty or invalid → fallback to direct sandbox~~
- [ ] ~~Log warning when fallback occurs~~
- [ ] ~~Graceful degradation, no breaking change~~

> **⚠️ OBSOLÈTE (2025-12-19):** Le concept de "fallback" est supprimé.
> ControlledExecutor utilise TOUJOURS WorkerBridge pour l'exécution.
> Voir "Architecture Unifiée" ci-dessous.

### AC8: Unified Response Format ✅
- [x] Response matches current `execute_code` format
- [x] Add optional DAG execution metadata:
  ```typescript
  {
    dag: {
      mode: "dag" | "sandbox",
      tasksCount?: number,
      layersCount?: number,
      speedup?: number,
      toolsDiscovered?: string[],
    }
  }
  ```

### AC9: Tests ✅
- [x] Test: simple code (1 tool) → DAG with 1 task → executes correctly (12 tests)
- [x] Test: sequential code (A → B → C) → DAG with dependencies
- [x] Test: parallel code (Promise.all) → parallel DAG execution
- [x] Test: conditional code (if/else) → conditional branches
- [x] Test: code with references → arguments resolved from previous results (11 tests)
- [ ] ~~Test: empty static_structure → fallback to direct execution~~ (OBSOLÈTE)
- [x] Total: 23 tests passing

### AC10: WorkerBridge Integration (Architecture Unifiée) ⬜ NEW
> **Objectif:** Éliminer le bypass sandbox dans `createToolExecutor()` pour 100% traçabilité RPC.

- [ ] `createToolExecutor()` utilise `WorkerBridge` au lieu de `client.callTool()` direct
- [ ] Toute exécution de task MCP passe par le Worker sandbox (permissions: "none")
- [ ] Les traces RPC sont capturées pour chaque appel tool
- [ ] Les handlers suivants sont modifiés :
  - [ ] `workflow-execution-handler.ts` : `createToolExecutor()` → WorkerBridge
  - [ ] `code-execution-handler.ts` : `createMcpToolExecutor()` → WorkerBridge
  - [ ] `control-commands-handler.ts` : `createToolExecutor()` → WorkerBridge

### AC11: Signature createToolExecutor Refactorisée ⬜ NEW
- [ ] Nouvelle signature : `createToolExecutor(workerBridge: WorkerBridge, toolDefs: ToolDefinition[])`
- [ ] Génère du code TypeScript pour chaque appel tool :
  ```typescript
  const code = `return await mcp.${server}.${toolName}(${JSON.stringify(args)});`;
  const result = await workerBridge.execute(code, toolDefs, {});
  ```
- [ ] Retourne le résultat via RPC (tracé)

### AC12: Tests WorkerBridge Integration ⬜ NEW
- [ ] Test: `createToolExecutor()` appelle WorkerBridge (pas client direct)
- [ ] Test: Les traces contiennent `tool_start`/`tool_end` pour chaque appel
- [ ] Test: Erreur si WorkerBridge non fourni
- [ ] Test: Integration DAG → WorkerBridge → traces capturées

### AC13: Unification execute() → Worker Only ⬜ NEW
> **Objectif:** Supprimer le chemin subprocess pour 100% traçabilité, même pour code sans tools.

- [ ] `DenoSandboxExecutor.execute()` utilise `WorkerBridge` (pas subprocess)
- [ ] L'ancien code subprocess est supprimé (buildCommand, executeWithTimeout, etc.)
- [ ] Si pas de tools : `WorkerBridge.execute(code, [], {})`
- [ ] `executeWithTools()` devient un alias de `execute()` (backward compat)
- [ ] Performance : Worker (~5ms) remplace subprocess (~50-100ms spawn)
- [ ] Tests mis à jour pour refléter le changement

**Avantages :**
- ✅ 100% traçabilité même pour code pur (math, transformations)
- ✅ Un seul chemin d'exécution (simplicité)
- ✅ Plus rapide (Worker thread vs process spawn)
- ✅ Permissions uniformes (`"none"` toujours)

**⚠️ Analyse des features subprocess à vérifier (2025-12-19) :**

| Feature subprocess | Nécessaire pour Worker ? | Conclusion |
|--------------------|-------------------------|------------|
| **REPL auto-return** (`wrapCode()`) | ❌ Non | Code DAG est généré avec `return` explicite |
| **Cache** (`this.cache.get/set`) | ❌ Non | MCP non-déterministe (fichiers changent) |
| **V8 memory limit** (`--max-old-space-size`) | ❌ Non applicable | Workers Deno n'ont pas de limite mémoire individuelle ([issue #26202](https://github.com/denoland/deno/issues/26202)). Timeout suffit. |
| Security validation | ✅ Déjà dans `executeWithTools()` | OK |
| Resource limiting | ✅ Déjà dans `executeWithTools()` | OK |

**À vérifier en profondeur avant implémentation :**
- [ ] Vérifier que TOUS les tests `execute()` passent avec Worker
- [ ] Benchmark latence Worker vs subprocess (confirmer ~5ms vs ~50ms)
- [ ] Vérifier qu'aucun code externe n'utilise `execute()` pour du REPL
- [ ] S'assurer que le timeout Worker est suffisant (pas de memory runaway)

---

## Tasks / Subtasks

- [x] **Task 1: Create DAG Converter** (AC: 1) ✅
  - [x] Create `src/dag/static-to-dag-converter.ts`
  - [x] Implement `staticStructureToDag(structure: StaticStructure): DAGStructure`
  - [x] Handle all node types (task, capability, decision, fork, join)
  - [x] Map edges to `dependsOn` relationships
  - [x] Export from `src/dag/mod.ts`

- [x] **Task 2: Implement Argument Resolver** (AC: 3) ✅
  - [x] Create `src/dag/argument-resolver.ts`
  - [x] Implement `resolveArguments(args, context, previousResults)`
  - [x] Handle literal, reference, parameter types
  - [x] Support nested object/array references

- [x] **Task 3: Handle Conditional Execution** (AC: 4) ✅
  - [x] Extend DAG converter to mark conditional tasks
  - [x] Implement condition evaluation at runtime
  - [x] Skip tasks when condition is false

- [x] **Task 4: Modify Code Execution Handler** (AC: 2, 6, 7) ✅
  - [x] Import `StaticStructureBuilder` and `staticStructureToDag`
  - [x] Build static_structure before execution
  - [x] Convert to DAG and execute via `ControlledExecutor`
  - [x] Implement fallback for empty/invalid structures
  - [x] Ensure per-layer validation works

- [x] **Task 5: Update Response Format** (AC: 8) ✅
  - [x] Add DAG execution metadata to response
  - [x] Maintain backward compatibility

- [x] **Task 6: Write Tests** (AC: 9) ✅
  - [x] Create `tests/dag/static-to-dag-converter_test.ts` (12 tests)
  - [x] Create `tests/dag/argument-resolver_test.ts` (11 tests)
  - [x] Total: 23 tests passing

- [ ] **Task 7: Refactor createToolExecutor() to use WorkerBridge** (AC: 10, 11) ⬜ NEW
  - [ ] Créer `createToolExecutorViaWorker(workerBridge, toolDefs)` dans un nouveau fichier
  - [ ] Modifier `workflow-execution-handler.ts` pour utiliser le nouveau executor
  - [ ] Modifier `code-execution-handler.ts` pour utiliser le nouveau executor
  - [ ] Modifier `control-commands-handler.ts` pour utiliser le nouveau executor
  - [ ] Supprimer l'ancien `createToolExecutor(mcpClients)` après migration

- [ ] **Task 8: WorkerBridge Integration Tests** (AC: 12) ⬜ NEW
  - [ ] Test: appel tool via WorkerBridge génère traces `tool_start`/`tool_end`
  - [ ] Test: DAG execution complète avec traces capturées
  - [ ] Test: erreur propagée si tool échoue
  - [ ] Créer `tests/dag/workerbridge-executor_test.ts`

- [ ] **Task 9: Unifier execute() vers Worker** (AC: 13) ⬜ NEW
  - [ ] **Phase 1: Vérification**
    - [ ] Lister tous les appelants de `execute()` (grep usage)
    - [ ] Vérifier qu'aucun n'utilise REPL-style (expressions sans return)
    - [ ] Benchmark subprocess vs Worker latence
  - [ ] **Phase 2: Refactorisation**
    - [ ] Refactoriser `DenoSandboxExecutor.execute()` pour utiliser `WorkerBridge`
    - [ ] `execute(code, context?)` → `WorkerBridge.execute(code, [], context)`
    - [ ] `executeWithTools()` devient alias → `execute(code, context, toolDefs)`
  - [ ] **Phase 3: Nettoyage**
    - [ ] Supprimer le code subprocess : `buildCommand()`, `executeWithTimeout()`, `parseOutput()`, `wrapCode()`
    - [ ] Supprimer `RESULT_MARKER`, `permissionSetToFlags()` si non utilisés ailleurs
  - [ ] **Phase 4: Tests**
    - [ ] Mettre à jour tous les tests `execute()` existants
    - [ ] Ajouter tests de non-régression
    - [ ] Vérifier timeout Worker fonctionne (pas de memory runaway)

### Review Follow-ups (AI)

**🔴 HIGH Priority:**
- [x] ~~[AI-Review][HIGH] H1: AC3 broken - resolveDAGArguments() uses empty previousResults Map~~ → **FIXED**: Refactoré `executor.ts` pour supporter le format structuré avec `staticArguments`, résolution runtime via `resolveStructuredReference()`
- [x] ~~[AI-Review][HIGH] H2: Arguments not propagated~~ → **FAUX POSITIF**: Les arguments SONT utilisés, juste via différents chemins selon le type de task
- [ ] [AI-Review][HIGH] H3: Missing integration test - No test validates full flow: Code → StaticStructure → DAG → ControlledExecutor → Result
- [ ] **[AI-Review][HIGH] H4: Sandbox Bypass - `createToolExecutor()` appelle `client.callTool()` directement** (2025-12-19)
  - Perte de 100% traçabilité RPC
  - Les appels MCP ne sont pas capturés dans les traces WorkerBridge
  - **Fix:** AC10, AC11, AC12 (Task 7, Task 8)

**🟡 MEDIUM Priority:**
- [x] ~~[AI-Review][MEDIUM] M1: Argument resolution timing~~ → **FIXED**: Résolu par le refacto H1, résolution per-task avec `previousResults`
- [ ] [AI-Review][MEDIUM] M2: Silent fallback - DAG errors logged but not returned to caller → **DESIGN DECISION**: Voir section "Compréhension Architecture" ci-dessous
- [ ] [AI-Review][MEDIUM] M3: Type mismatch - ConditionalDAGStructure vs DAGStructure → À investiguer avec AC4

**🟢 LOW Priority:**
- [ ] [AI-Review][LOW] L1: Magic number - resultPreview truncation at 240 chars should be configurable constant [controlled-executor.ts:969]
- [ ] [AI-Review][LOW] L2: Test comment unclear - "1 fork + 1 = 2 layers" logic is confusing [static-to-dag-converter_test.ts:206]
- [ ] [AI-Review][LOW] L3: Missing JSDoc - resolveDAGArguments() lacks documentation [code-execution-handler.ts:288]

### Corrections appliquées

1. **Refacto `executor.ts`** : Support du format structuré `staticArguments` avec résolution runtime
2. **Dépréciation `$OUTPUT[...]`** : Format legacy marqué deprecated, nouveau format `{ type: "reference", expression: "n1.content" }`
3. **Mapping variable→nodeId** : `StaticStructureBuilder` convertit `file.content` → `n1.content` pour les références

---

## Dev Notes

### Current Flow (code-execution-handler.ts)

```typescript
// Lines 49-96: Current direct execution
const executor = new DenoSandboxExecutor({...});
const result = await executor.execute(code, executionContext, mcpProxy);
```

### New Flow

```typescript
// 1. Build static structure
const staticStructure = await staticStructureBuilder.buildStaticStructure(code);

// 2. Convert to DAG (if valid structure)
if (staticStructure.nodes.length > 0) {
  const dag = staticStructureToDag(staticStructure);

  // 3. Execute via ControlledExecutor
  const executor = new ControlledExecutor(toolExecutor, config);
  const result = await executor.execute(dag);

  return { result, executedViaDAG: true };
} else {
  // Fallback to direct execution
  const executor = new DenoSandboxExecutor({...});
  return { result, executedViaDAG: false };
}
```

### StaticStructureNode → Task Mapping

| StaticStructureNode | Task |
|---------------------|------|
| `{ type: "task", tool: "fs:read" }` | `{ id, tool: "fs:read", type: "mcp_tool" }` |
| `{ type: "capability", capabilityId }` | `{ id, capabilityId, type: "capability" }` |
| `{ type: "fork" }` | Marker for parallel start |
| `{ type: "join" }` | Task depends on all fork children |
| `{ type: "decision" }` | Creates conditional edges |

### Edge → dependsOn Mapping

```typescript
// StaticStructureEdge
{ from: "n1", to: "n2", type: "sequence" }
// → Task n2.dependsOn = ["n1"]

// Conditional edge
{ from: "d1", to: "n2", type: "conditional", outcome: "true" }
// → Task n2.dependsOn = ["d1"], n2.condition = { nodeId: "d1", outcome: "true" }

// Fork edges
{ from: "f1", to: "n2" }, { from: "f1", to: "n3" }
// → Tasks n2, n3 have no dependencies (parallel)
// → Join task depends on [n2, n3]
```

### Argument Resolution Example

```typescript
// Static structure node with arguments (from Story 10.2)
{
  id: "n2",
  type: "task",
  tool: "json:parse",
  arguments: {
    input: { type: "reference", expression: "n1.content" }
  }
}

// At runtime, resolve from previous task result
const n1Result = taskResults.get("n1"); // { content: "..." }
const resolvedArgs = {
  input: n1Result.content  // Resolved!
};
```

### Files to Create

- `src/dag/static-to-dag-converter.ts` (~150 LOC)
- `src/dag/argument-resolver.ts` (~100 LOC)

### Files to Modify

- `src/mcp/handlers/code-execution-handler.ts` (~80 LOC changes)
- `src/dag/mod.ts` (exports)

### Key Considerations

1. **Backward compatibility:** Fallback ensures no breaking changes
2. **Performance:** DAG overhead should be minimal for simple code
3. **Debugging:** Log when DAG execution is used vs fallback
4. **Error handling:** If DAG conversion fails, fallback gracefully

### References

**Source Files:**
- `src/capabilities/static-structure-builder.ts` - Builds static_structure
- `src/capabilities/types.ts:440-498` - StaticStructure types
- `src/dag/controlled-executor.ts` - DAG executor with features
- `src/mcp/handlers/code-execution-handler.ts` - Current handler
- `src/dag/execution/task-router.ts` - Task type routing

**Previous Stories:**
- [Story 10.1](10-1-static-analysis-capability-creation.md) - Static structure builder
- [Story 10.2](10-2-static-argument-extraction.md) - Argument extraction

---

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A

### Completion Notes List

1. Created `staticStructureToDag()` converter that maps StaticStructure to DAGStructure
2. Created `resolveArguments()` for runtime argument resolution (literal, reference, parameter)
3. Modified `handleExecuteCode()` with try-DAG-first approach and sandbox fallback
4. Added `DAGExecutionMetadata` to response format
5. All 23 tests passing (12 converter + 11 resolver)

### Change Log

- 2025-12-19: Story redefined - focus on executing code via inferred DAG (Claude Opus 4.5)
- 2025-12-19: Development complete - 23 tests passing (Claude Opus 4.5)
- 2025-12-19: Code review - 4 HIGH, 3 MEDIUM, 3 LOW issues found, action items created (Claude Opus 4.5)
- 2025-12-19: **DESIGN GAP DISCOVERED** - Sandbox/DAG execution unification needed
- 2025-12-19: **CODE REVIEW CLARIFICATION** - Le fallback sandbox est une feature (pas un bug). DAG mode pour pure MCP, sandbox pour JS complexe. Documenté la compréhension architecture complète.
- 2025-12-19: **DECISION WORKER PERMISSIONS = "none"** - Après analyse, les permissions granulaires Worker sont inutiles car tous les appels I/O passent par MCP RPC. Worker forcé à "none" pour 100% traçabilité. PermissionSet dans YAML = metadata uniquement (inférence, HIL, audit).

---

## Compréhension Architecture (Code Review Discussion)

> **⚠️ SECTION OBSOLÈTE (2025-12-19)**
>
> Cette section décrivait un modèle avec "fallback sandbox" qui est **incorrect**.
> Voir la section "Architecture Unifiée" ci-dessous pour le design actuel.

### ~~Le modèle "Transpilation"~~ (OBSOLÈTE)

~~Le design de Story 10.5 est une **transpilation** TypeScript → DAG~~

**PROBLÈME IDENTIFIÉ :** Le mode DAG appelait `client.callTool()` directement,
bypassant le Worker RPC et perdant 100% de traçabilité.

---

## Architecture Unifiée (2025-12-19)

### Principe fondamental

**TOUT passe par le Worker Sandbox (permissions: "none") pour 100% traçabilité.**

```
Code TypeScript
      │
      ▼
Static Analysis (SWC) → static_structure → Capability
      │
      ▼
ControlledExecutor (orchestration)
├── Layers (parallel groups)
├── Checkpoints
├── HIL/per_layer_validation
      │
      ▼
Pour chaque task:
      │
      ▼
WorkerBridge.execute(taskCode)
      │
      ▼
Worker (permissions: "none")
      │
      ▼
RPC Proxy → client.callTool()
      │
      ▼
100% traçabilité ✅
```

### Rôles clarifiés

| Composant | Rôle |
|-----------|------|
| `StaticStructureBuilder` | Parse le code → extrait le DAG statique |
| `ControlledExecutor` | **Orchestration** : layers, checkpoints, HIL |
| `WorkerBridge` | **Exécution** : sandbox isolée, RPC tracing |

### ~~Fallback~~ → Plus de fallback

**AVANT (incorrect):**
- Mode DAG = appels directs `client.callTool()` (pas de trace)
- Mode Sandbox = fallback quand DAG échoue

**APRÈS (correct):**
- UN seul chemin d'exécution
- ControlledExecutor orchestrate
- WorkerBridge exécute chaque task

### Code à modifier

```typescript
// workflow-execution-handler.ts - AVANT
function createToolExecutor(mcpClients) {
  return async (tool, args) => client.callTool(tool, args); // ❌ Direct
}

// workflow-execution-handler.ts - APRÈS
function createToolExecutor(workerBridge, toolDefs) {
  return async (tool, args) => {
    const [server, toolName] = tool.split(":");
    const code = `return await mcp.${server}.${toolName}(${JSON.stringify(args)});`;
    const result = await workerBridge.execute(code, toolDefs, {});
    return result.result;
  }; // ✅ Via sandbox RPC
}
```

### Fichiers à modifier

| Fichier | Changement |
|---------|------------|
| `workflow-execution-handler.ts` | `createToolExecutor()` → utiliser `WorkerBridge` |
| `code-execution-handler.ts` | `createMcpToolExecutor()` → utiliser `WorkerBridge` |
| `control-commands-handler.ts` | `createToolExecutor()` → utiliser `WorkerBridge` |

### Décision Architecture : Worker permissions = "none" (2025-12-19)

**Contexte :**
Le Worker utilise le pattern RPC : le code s'exécute dans le Worker, mais tous les appels MCP passent par le main process via `postMessage`. Le Worker ne fait pas d'appels directs au réseau ou au filesystem.

**Décision :**
Worker permissions = `"none"` toujours. Cela force TOUT à passer par MCP RPC.

**Avantages :**
1. **100% traçable** - Tous les appels passent par le proxy RPC
2. **Contrôle centralisé** - Le main process contrôle les permissions
3. **Pas de bypass** - Le code ne peut pas utiliser `Deno.readFile()` ou `fetch()` directement

**PermissionSet dans mcp-permissions.yaml :**
Le fichier YAML est utilisé pour **metadata uniquement** :
- Inférence de permissions pour les capabilities
- Détection HIL (`requiresValidation()` côté serveur)
- Audit/UI

**Ce n'est PAS de l'enforcement** - les vraies permissions sont :
- Deno Worker = "none" (forcé)
- MCP servers = gèrent leur propre auth (tokens, scopes)

**Fichiers modifiés :**
- `src/sandbox/worker-bridge.ts` - Constante `WORKER_PERMISSIONS = "none"`
- `src/sandbox/executor.ts` - Suppression du passage de permissionSet au bridge

**Références :**
- `docs/spikes/2025-12-19-capability-vs-trace-clarification.md`
- `docs/tech-specs/tech-spec-hil-permission-escalation-fix.md`

### File List

- [x] `src/dag/static-to-dag-converter.ts` - NEW (~220 LOC)
- [x] `src/dag/argument-resolver.ts` - NEW (~230 LOC)
- [x] `src/dag/mod.ts` - MODIFY (exports)
- [x] `src/mcp/handlers/code-execution-handler.ts` - MODIFY (~350 LOC changes)
- [x] `tests/dag/static-to-dag-converter_test.ts` - NEW (12 tests)
- [x] `tests/dag/argument-resolver_test.ts` - NEW (11 tests)

---

## Analyse Nettoyage de Code (2025-12-19)

### Inventaire des Méthodes Execute

| Fichier | Méthode | Rôle | Action |
|---------|---------|------|--------|
| `sandbox/executor.ts:191` | `DenoSandboxExecutor.execute()` | Subprocess Deno direct (sans tools) | **SUPPRIMER** (AC13) - remplacé par Worker |
| `sandbox/executor.ts:1009` | `DenoSandboxExecutor.executeWithTools()` | Wrapper → WorkerBridge | **RENOMMER** → `execute()` (AC13) |
| `sandbox/worker-bridge.ts:208` | `WorkerBridge.execute()` | RPC Bridge Worker (canonical) | **GARDER** - chemin principal ✅ |
| `dag/executor.ts:72` | `ParallelExecutor.execute()` | DAG avec topological sort | **GARDER** - classe de base |
| `dag/controlled-executor.ts:273` | `ControlledExecutor.executeStream()` | DAG avec events/checkpoints | **GARDER** - chemin principal ✅ |
| `dag/controlled-executor.ts:441` | `ControlledExecutor.execute()` | Override qui wrappe executeStream | **GARDER** |
| `mcp/handlers/code-execution-handler.ts:317` | `createMcpToolExecutor()` | **BUG** - bypass WorkerBridge! | **FIX** (AC10) |
| `mcp/handlers/workflow-execution-handler.ts` | `createToolExecutor()` | **BUG** - bypass WorkerBridge! | **FIX** (AC10) |
| `mcp/handlers/control-commands-handler.ts` | `createToolExecutor()` | **BUG** - bypass WorkerBridge! | **FIX** (AC10) |

### Verdict : Unification vers Worker (AC13)

**Avant (2 chemins) :**

```
┌─────────────────────────────────────────────────────────────┐
│ DenoSandboxExecutor                                         │
│   ├── execute()        → Subprocess (❌ pas tracé)          │
│   └── executeWithTools() → Worker (✅ tracé)                │
└─────────────────────────────────────────────────────────────┘
```

**Après (1 seul chemin - AC13) :**

```
┌─────────────────────────────────────────────────────────────┐
│ DenoSandboxExecutor                                         │
│   └── execute(code, context?, toolDefs?)                    │
│         │                                                   │
│         └── WorkerBridge.execute(code, toolDefs ?? [], ctx) │
│               │                                             │
│               └── Worker (permissions: "none")              │
│                     │                                       │
│                     └── 100% traçabilité ✅                 │
└─────────────────────────────────────────────────────────────┘

Code subprocess supprimé :
  - buildCommand()
  - executeWithTimeout()
  - parseOutput()
  - wrapCode()
  - RESULT_MARKER parsing
```

### Le Vrai Problème

**Un seul bug** : `createToolExecutor()` (3 endroits) appelle `client.callTool()` directement.

```typescript
// code-execution-handler.ts:317 - MAUVAIS!
function createMcpToolExecutor(mcpClients): ToolExecutor {
  return async (tool, args) => {
    const client = mcpClients.get(serverId);
    return await client.callTool(toolName, args); // ← BYPASS!
  };
}
```

**Conséquences :**
1. ❌ Permissions sandbox ignorées
2. ❌ Traces RPC non capturées
3. ❌ Exécution DAG bypass le Worker

### Plan de Fix (Task 7)

```typescript
// NOUVEAU: src/dag/execution/workerbridge-executor.ts
export function createToolExecutorViaWorker(
  workerBridge: WorkerBridge,
  toolDefs: ToolDefinition[],
): ToolExecutor {
  return async (tool: string, args: Record<string, unknown>): Promise<unknown> => {
    const [server, toolName] = tool.split(":");
    const code = `return await mcp.${server}.${toolName}(${JSON.stringify(args)});`;
    const result = await workerBridge.execute(code, toolDefs, {});
    if (!result.success) {
      throw new Error(result.error?.message ?? "Tool execution failed");
    }
    return result.result;
  };
}
```

### Ce qui NE change PAS

- `ParallelExecutor/ControlledExecutor` - OK, juste l'orchestration
- `WorkerBridge.execute()` - LE chemin canonical, inchangé

### Ce qui CHANGE (AC13)

- `DenoSandboxExecutor.execute()` - **SUPPRIMÉ** (subprocess → Worker)
- `DenoSandboxExecutor.executeWithTools()` - **RENOMMÉ** → `execute()`
- Signature unifiée : `execute(code, context?, toolDefs?)`
- Si pas de tools : `toolDefs = []` → Worker quand même
