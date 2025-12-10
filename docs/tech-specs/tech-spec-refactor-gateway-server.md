# Tech-Spec: Refactoring gateway-server.ts en modules testables

**Created:** 2025-12-10
**Status:** Ready for Development

## Overview

### Problem Statement

Le fichier `src/mcp/gateway-server.ts` fait actuellement **2487 lignes** et gère 8 responsabilités distinctes :
1. MCP Protocol Handlers (list/call/get tools)
2. Workflow Execution (DAG orchestration)
3. Control Tools (continue/abort/replan/approval)
4. Tool Search (semantic + capabilities)
5. Code Execution (sandboxed)
6. Schema Management & Utilities
7. Transport (stdio/HTTP/SSE)
8. **Rate Limiting (Story 9.5)** - per-user/per-IP rate limiting avec limites différenciées par endpoint

**Problèmes :**
- Fichier monolithique difficile à maintenir
- Testabilité limitée (nécessite mock de toutes les dépendances)
- Ajout de nouvelles fonctionnalités complexe
- Responsabilités multiples violent le Single Responsibility Principle

### Solution

Extraire progressivement les responsabilités en modules indépendants tout en maintenant :
- ✅ Compatibilité API MCP (aucun breaking change)
- ✅ Tous les tests existants qui passent
- ✅ Backward compatibility complète

**Approche : Refactoring par extraction progressive (strangler pattern)**

### Scope

**In Scope:**
- Extraction de 7 modules/handlers depuis gateway-server.ts
- Création de tests unitaires pour chaque module
- Maintien de 100% de compatibilité backward
- Documentation des nouveaux modules

**Out of Scope:**
- Modification de l'API MCP
- Changements fonctionnels
- Optimisations de performance
- Migration des tests existants (ils continuent à tester gateway-server.ts)

## Context for Development

### Codebase Patterns

**Conventions TypeScript (CRITICAL):**
```typescript
// Classes & Interfaces
class ToolSearchHandler {}         // PascalCase
interface HandlerConfig {}          // PascalCase

// Functions & methods
function handleSearchTools() {}     // camelCase
async executeWorkflow() {}          // camelCase

// Properties & parameters
private toolCache: Map              // camelCase
const workflowId = "..."           // camelCase

// Constants
const MAX_RETRIES = 3              // UPPER_SNAKE_CASE
const DEFAULT_TIMEOUT = 5000       // UPPER_SNAKE_CASE

// Event payloads (IMPORTANT - déjà en camelCase dans types.ts)
workflowId, taskId, executionTimeMs  // camelCase (pas workflow_id)
```

**Architecture actuelle:**
```
src/mcp/
├── gateway-server.ts          (2487 lignes - à refactorer)
├── gateway-handler.ts         (DAG suggestion logic)
├── client.ts                  (MCP client wrapper)
├── types.ts                   (shared types)
└── workflow-dag-store.ts      (persistence)
```

**Dépendances injectées dans le constructor:**
```typescript
constructor(
  private db: PGliteClient,
  private vectorSearch: VectorSearch,
  private graphEngine: GraphRAGEngine,
  private dagSuggester: DAGSuggester,
  private executor: ParallelExecutor,
  private mcpClients: Map<string, MCPClient>,
  private capabilityStore?: CapabilityStore,
  private adaptiveThresholdManager?: AdaptiveThresholdManager,
  config?: GatewayServerConfig,
)
```

### Files to Reference

**Code à lire avant de commencer:**
1. `src/mcp/gateway-server.ts` (2487 lignes) - fichier source
2. `src/mcp/types.ts` - types partagés MCP
3. `src/graphrag/types.ts` - types DAG/Task
4. `src/dag/types.ts` - types ExecutionEvent

**Tests existants (doivent continuer à passer):**
1. `tests/unit/mcp/gateway_server_test.ts` - tests unitaires
2. `tests/unit/mcp/gateway_handler_test.ts` - tests du handler
3. `tests/e2e/07-gateway.test.ts` - tests E2E
4. `tests/integration/mcp_gateway_e2e_test.ts` - tests d'intégration

### Technical Decisions

#### ADR-001: Architecture de Refactoring - Strangler Pattern

**Status:** Approuvé
**Date:** 2025-12-10
**Décideurs:** Panel d'architectes (Pragmatic, Purist, Balanced)

**Contexte:**
gateway-server.ts fait 2487 lignes avec 7 responsabilités. Besoin de refactorer pour améliorer testabilité et maintenabilité sans casser l'API MCP.

**Décision:**
Utiliser Strangler Pattern avec extraction progressive sur 6 phases (Phase 4+5 fusionnées).

**Conséquences:**

*Positives:*
- Risque minimal (code existant reste fonctionnel)
- Déploiement incrémental possible
- Rollback facile par phase

*Négatives:*
- Code dupliqué temporaire pendant 2-4 semaines
- Nécessite discipline pour maintenir cohérence

**Détails d'Implémentation:**

**1. Gestion État Partagé `activeWorkflows`:**

Créer `WorkflowStateManager` pour gérer l'état partagé:

```typescript
// src/mcp/handlers/workflow-state-manager.ts
export class WorkflowStateManager {
  private workflows = new Map<string, ActiveWorkflow>();

  get(id: string): ActiveWorkflow | undefined {
    return this.workflows.get(id);
  }

  set(id: string, workflow: ActiveWorkflow): void {
    this.workflows.set(id, workflow);
  }

  delete(id: string): boolean {
    return this.workflows.delete(id);
  }

  has(id: string): boolean {
    return this.workflows.has(id);
  }

  clear(): void {
    this.workflows.clear();
  }
}
```

**Pourquoi pas EventEmitter?**
- Over-engineering pour ce cas simple
- Ajoute complexité inutile
- Map partagée avec API claire suffit

**2. Injection de Dépendances (Pattern Simple):**

Dans `gateway-server.ts` constructor:

```typescript
private initializeHandlers() {
  // État partagé
  const workflowState = new WorkflowStateManager();

  // Handlers simples (pas d'état)
  this.schemaManager = new SchemaManager();

  this.toolSearchHandler = new ToolSearchHandler(
    this.vectorSearch,
    this.mcpClients,
    this.capabilityStore
  );

  this.codeExecutionHandler = new CodeExecutionHandler(
    this.vectorSearch,
    this.mcpClients,
    this.config.piiProtection,
    this.config.cacheConfig
  );

  // Handlers avec état partagé
  this.workflowOrchestrationHandler = new WorkflowOrchestrationHandler(
    workflowState,  // État partagé injecté
    this.dagSuggester,
    this.executor,
    this.checkpointManager,
    this.graphEngine,
    this.mcpClients
  );

  this.mcpProtocolHandler = new MCPProtocolHandler(
    this.toolSearchHandler,
    this.codeExecutionHandler,
    this.workflowOrchestrationHandler
  );
}
```

**Pourquoi pas de conteneur DI externe?**
- YAGNI (You Ain't Gonna Need It)
- Instanciation explicite = plus simple à débugger
- Dépendances claires dans le constructor

**3. Ordre d'Extraction Révisé:**

**❌ AVANT:** Phase 4 (Control Tools) → Phase 5 (Workflow Execution) séparément
**✅ APRÈS:** Phase 4 fusionnée = Workflow Orchestration (Control + Execution)

**Raison:** Couplage fort via `activeWorkflows`
- Control Tools modifie activeWorkflows (abort, continue)
- Workflow Execution lit/écrit activeWorkflows (pause/resume)
- Séparer = risque de bugs de synchronisation

**Nouveau module:** `workflow-orchestration-handler.ts`
- Inclut: Control Tools + Workflow Execution
- État: WorkflowStateManager injecté
- Responsabilité: Orchestration complète des workflows DAG

---

#### Décision 2: Injection de dépendances

- Chaque handler reçoit uniquement les dépendances dont il a besoin
- Pas de passage du `this` complet de GatewayServer
- Pattern constructor injection (simple et testable)

#### Décision 3: Tests

- Nouveaux modules = nouveaux tests unitaires
- Tests existants continuent à tester gateway-server.ts
- Objectif: 80%+ coverage pour les nouveaux modules

#### Décision 4: Ordre d'extraction (moins risqué en premier)

1. Schema & Utilities (pure functions, zéro état)
2. Tool Search (peu de side effects)
3. Code Execution (isolé, sandboxed)
4. **Workflow Orchestration** (Control + Execution fusionnés - HIGH RISK)
5. MCP Protocol Handlers (orchestration finale)

## Implementation Plan

### Phase 1: Extraction Schema & Utilities (LOW RISK)

**Créer:** `src/mcp/handlers/schema-manager.ts`

**Extraire ces méthodes:**
- `hashToolSchema(schema)` (ligne 1967)
- `trackToolUsage(toolKey)` (ligne 1986)
- `trackToolSchemaInternal(toolKey, schema)` (ligne 2011)
- `buildToolVersionsMap()` (ligne 2027)
- `formatMCPError(error, context)` (ligne 2043)

**Tasks:**
- [ ] Créer `src/mcp/handlers/schema-manager.ts`
- [ ] Extraire les 5 méthodes dans la nouvelle classe `SchemaManager`
- [ ] Créer `tests/unit/mcp/schema_manager_test.ts` avec tests unitaires
- [ ] Modifier gateway-server.ts pour déléguer à SchemaManager
- [ ] Vérifier que tous les tests existants passent

**Acceptance Criteria:**
- [ ] AC1: Tous les tests existants passent sans modification
- [ ] AC2: SchemaManager a 80%+ de coverage
- [ ] AC3: Gateway-server.ts délègue à SchemaManager
- [ ] AC4: Pas de breaking changes dans l'API MCP

### Phase 2: Extraction Tool Search (LOW-MEDIUM RISK)

**Créer:** `src/mcp/handlers/tool-search-handler.ts`

**Extraire ces méthodes:**
- `handleSearchTools(query, options)` (ligne 971-1075)
- `handleSearchCapabilities(query, options)` (ligne 1077-1160)

**Dépendances nécessaires:**
- `vectorSearch: VectorSearch`
- `capabilityStore?: CapabilityStore`
- `mcpClients: Map<string, MCPClient>`

**Tasks:**
- [ ] Créer `src/mcp/handlers/tool-search-handler.ts`
- [ ] Définir interface `ToolSearchHandlerConfig`
- [ ] Extraire les 2 méthodes dans classe `ToolSearchHandler`
- [ ] Créer `tests/unit/mcp/tool_search_handler_test.ts`
- [ ] Modifier gateway-server.ts pour instancier et déléguer
- [ ] Vérifier tous les tests

**Acceptance Criteria:**
- [ ] AC1: handleSearchTools retourne les mêmes résultats
- [ ] AC2: handleSearchCapabilities fonctionne avec/sans capabilityStore
- [ ] AC3: Tests unitaires isolés (mocks des dépendances)
- [ ] AC4: Performance identique (pas de régression)

### Phase 3: Extraction Code Execution (MEDIUM RISK)

**Créer:** `src/mcp/handlers/code-execution-handler.ts`

**Extraire cette méthode:**
- `handleExecuteCode(request)` (ligne 1162-1384, 222 lignes)

**Dépendances nécessaires:**
- `vectorSearch: VectorSearch`
- `mcpClients: Map<string, MCPClient>`
- `config.piiProtection`
- `config.cacheConfig`

**Tasks:**
- [ ] Créer `src/mcp/handlers/code-execution-handler.ts`
- [ ] Définir interface `CodeExecutionConfig`
- [ ] Extraire méthode handleExecuteCode
- [ ] Gérer DenoSandboxExecutor et ContextBuilder en interne
- [ ] Créer `tests/unit/mcp/code_execution_handler_test.ts`
- [ ] Tests: sandbox isolation, PII protection, cache hits
- [ ] Modifier gateway-server.ts pour déléguer
- [ ] Vérifier tous les tests E2E code execution

**Acceptance Criteria:**
- [ ] AC1: Sandbox isolation maintenue
- [ ] AC2: PII protection fonctionne (detokenize si enabled)
- [ ] AC3: Cache fonctionne (hits/misses corrects)
- [ ] AC4: Tracing hiérarchique préservé (ADR-041)

### Phase 4: Extraction Workflow Orchestration (HIGH RISK - Control + Execution fusionnés)

**Créer:**
- `src/mcp/handlers/workflow-state-manager.ts`
- `src/mcp/handlers/workflow-orchestration-handler.ts`

**Extraire ces méthodes (Control Tools):**
- `handleContinue(workflowId)` (ligne 1386-1470)
- `continueFromActiveWorkflow(workflowId)` (ligne 1472-1501)
- `handleAbort(workflowId, reason)` (ligne 1620-1702)
- `handleReplan(workflowId, requirement)` (ligne 1704-1821)
- `handleApprovalResponse(workflowId, approved, feedback)` (ligne 1823-1951)

**Extraire ces méthodes (Workflow Execution):**
- `handleWorkflowExecution(dag, options)` (ligne 656-820)
- `executeWithPerLayerValidation(dag, options)` (ligne 822-969)
- `processGeneratorUntilPause(generator, workflowId)` (ligne 1503-1618)

**État partagé:**
- Créer `WorkflowStateManager` pour gérer `activeWorkflows`
- Injecter dans WorkflowOrchestrationHandler

**Dépendances:**
- `workflowState: WorkflowStateManager` (nouv eau)
- `dagSuggester: DAGSuggester`
- `executor: ParallelExecutor`
- `checkpointManager: CheckpointManager`
- `graphEngine: GraphRAGEngine`
- `vectorSearch: VectorSearch` (pour tool injection)
- `mcpClients: Map<string, MCPClient>`

**Tasks:**
- [ ] Créer `src/mcp/handlers/workflow-state-manager.ts`
- [ ] Implémenter WorkflowStateManager avec get/set/delete/has/clear
- [ ] Créer `src/mcp/handlers/workflow-orchestration-handler.ts`
- [ ] Définir interface `WorkflowOrchestrationConfig`
- [ ] Extraire les 5 méthodes de contrôle (continue/abort/replan/approval)
- [ ] Extraire les 3 méthodes d'exécution workflow
- [ ] Gérer ContextBuilder en interne pour tool injection
- [ ] Créer `tests/unit/mcp/workflow_state_manager_test.ts`
- [ ] Créer `tests/unit/mcp/workflow_orchestration_handler_test.ts`
- [ ] Tests Control Tools: continue, abort, replan, approval scenarios
- [ ] Tests Workflow Execution: AIL decision points, HIL approval, per-layer validation
- [ ] Modifier gateway-server.ts pour instancier et déléguer
- [ ] Vérifier tests E2E 09-full-workflow.test.ts
- [ ] Vérifier tests integration control_tools_test.ts

**Acceptance Criteria:**
- [ ] AC1: WorkflowStateManager gère activeWorkflows thread-safe
- [ ] AC2: Continue reprend workflow correctement depuis pause
- [ ] AC3: Abort nettoie activeWorkflows et stoppe exécution
- [ ] AC4: Replan génère nouveau DAG via dagSuggester
- [ ] AC5: Approval response gère approved=true/false
- [ ] AC6: AIL decision points fonctionnent (continue/abort/replan)
- [ ] AC7: HIL approval checkpoints fonctionnent
- [ ] AC8: Per-layer validation sauvegarde checkpoints
- [ ] AC9: processGeneratorUntilPause pause correctement sur decision_required
- [ ] AC10: Événements workflow_start/complete/layer_start émis
- [ ] AC11: État activeWorkflows synchronisé entre tous les consumers

### Phase 5: Extraction MCP Protocol Handlers (MEDIUM RISK)

**Créer:** `src/mcp/handlers/mcp-protocol-handler.ts`

**Extraire ces méthodes:**
- `handleListTools(request)` (ligne 235-520, 285 lignes)
- `handleCallTool(request)` (ligne 522-654)
- `handleGetPrompt(request)` (ligne 1954-1965)

**Dépendances:**
- Délégation vers ToolSearchHandler
- Délégation vers CodeExecutionHandler
- Délégation vers WorkflowExecutionHandler
- Délégation vers ControlToolsHandler

**Tasks:**
- [ ] Créer `src/mcp/handlers/mcp-protocol-handler.ts`
- [ ] Extraire handleListTools (routing vers search/capabilities)
- [ ] Extraire handleCallTool (routing vers execute_code/workflow/control)
- [ ] Extraire handleGetPrompt (simple, pas de dépendances)
- [ ] Créer `tests/unit/mcp/mcp_protocol_handler_test.ts`
- [ ] Tests: routing correct, error handling, MCP spec compliance
- [ ] Modifier gateway-server.ts pour déléguer
- [ ] Vérifier tous les tests gateway

**Acceptance Criteria:**
- [ ] AC1: handleListTools route correctement vers search handlers
- [ ] AC2: handleCallTool route vers le bon handler selon tool name
- [ ] AC3: Erreurs formatées selon spec MCP
- [ ] AC4: Backward compatibility 100%

### Phase 6: Nettoyage final

**Tasks:**
- [ ] Supprimer code dupliqué de gateway-server.ts
- [ ] Gateway-server.ts devient orchestrateur léger (~300-400 lignes)
- [ ] Mettre à jour documentation ADR si nécessaire
- [ ] Créer diagramme d'architecture des nouveaux modules
- [ ] Code review final

**Acceptance Criteria:**
- [ ] AC1: Gateway-server.ts < 500 lignes
- [ ] AC2: Tous les tests passent (unit + integration + e2e)
- [ ] AC3: Coverage globale > 80%
- [ ] AC4: Documentation mise à jour

### Note: Rate Limiting (Story 9.5) - Reste dans gateway-server.ts

**Localisation:** Lignes 2105-2189 (dans `startHttpServer`)

Le rate limiting est intégré au HTTP server handler et **reste dans gateway-server.ts** car:
- Il fait partie de la couche transport/HTTP (pas de la logique métier)
- Il est appliqué AVANT le routing vers les handlers MCP
- Il utilise `RateLimiter` et `getRateLimitKey` qui sont déjà externalisés

**Code concerné:**
```typescript
// Ligne 2105-2108: Définition des limiters
const RATE_LIMITERS = {
  mcp: new RateLimiter(100, 60000),        // 100 req/min for MCP gateway
  api: new RateLimiter(200, 60000),        // 200 req/min for API/graph routes
  executions: new RateLimiter(100, 60000), // 100 req/min for executions
};

// Lignes 2154-2189: Application du rate limiting
const rateLimitKey = getRateLimitKey(authResult, clientIp);
// ... sélection du limiter selon endpoint
// ... vérification et réponse 429 si dépassé
```

**Dépendances externalisées (pas à extraire):**
- `src/utils/rate-limiter.ts` - Classe `RateLimiter`
- `src/lib/rate-limiter-helpers.ts` - Fonction `getRateLimitKey`

**Impact sur le refactoring:**
- Le rate limiting reste dans la méthode `startHttpServer` de gateway-server.ts
- Estimation finale gateway-server.ts: ~400-450 lignes (au lieu de ~300-400)
- Les handlers extraits ne gèrent PAS le rate limiting (c'est fait en amont)

## Additional Context

### Dependencies

**Modules existants (pas de modification):**
- `src/mcp/gateway-handler.ts` - DAG suggestion logic
- `src/mcp/client.ts` - MCP client wrapper
- `src/dag/controlled-executor.ts` - DAG executor
- `src/sandbox/executor.ts` - Code sandbox
- `src/vector/search.ts` - Vector search

**Architecture finale des fichiers:**

```
src/mcp/
├── gateway-server.ts                 (~400 lignes - orchestrateur léger)
├── gateway-handler.ts                (existant - DAG suggestion)
├── client.ts                         (existant - MCP client wrapper)
├── types.ts                          (existant - types partagés)
├── workflow-dag-store.ts             (existant - persistence DAG)
│
├── handlers/                         📁 NOUVEAU DOSSIER
│   ├── schema-manager.ts             (Phase 1 - ~150 lignes)
│   ├── tool-search-handler.ts        (Phase 2 - ~200 lignes)
│   ├── code-execution-handler.ts     (Phase 3 - ~250 lignes)
│   ├── workflow-state-manager.ts     (Phase 4 - ~50 lignes)
│   ├── workflow-orchestration-handler.ts (Phase 4 - ~600 lignes)
│   └── mcp-protocol-handler.ts       (Phase 5 - ~300 lignes)
│
└── adaptive-threshold.ts             (existant - threshold management)

tests/
├── unit/mcp/
│   ├── gateway_server_test.ts        (existant - continue à tester gateway-server)
│   ├── gateway_handler_test.ts       (existant)
│   │
│   ├── schema_manager_test.ts        📄 NOUVEAU (Phase 1)
│   ├── tool_search_handler_test.ts   📄 NOUVEAU (Phase 2)
│   ├── code_execution_handler_test.ts 📄 NOUVEAU (Phase 3)
│   ├── workflow_state_manager_test.ts 📄 NOUVEAU (Phase 4)
│   ├── workflow_orchestration_handler_test.ts 📄 NOUVEAU (Phase 4)
│   └── mcp_protocol_handler_test.ts  📄 NOUVEAU (Phase 5)
│
├── benchmarks/
│   └── gateway_refactor_bench.ts     📄 NOUVEAU (Performance tracking)
│
├── e2e/
│   └── 07-gateway.test.ts            (existant - continue à passer)
│
└── integration/
    ├── mcp_gateway_e2e_test.ts       (existant - continue à passer)
    └── mcp/
        └── control_tools_test.ts     (existant - continue à passer)
```

**Taille estimée des nouveaux modules:**

| Module | Lignes Code | Lignes Tests | Ratio |
|--------|-------------|--------------|-------|
| schema-manager.ts | ~150 | ~200 | 1.3x |
| tool-search-handler.ts | ~200 | ~300 | 1.5x |
| code-execution-handler.ts | ~250 | ~400 | 1.6x |
| workflow-state-manager.ts | ~50 | ~100 | 2.0x |
| workflow-orchestration-handler.ts | ~600 | ~800 | 1.3x |
| mcp-protocol-handler.ts | ~300 | ~400 | 1.3x |
| **TOTAL NOUVEAU CODE** | **~1550** | **~2200** | **1.4x** |
| gateway-server.ts (après) | ~400 | (tests existants) | - |
| **TOTAL FINAL** | **~1950** | **~2200** | **1.1x** |

**Réduction nette:**
- Avant: 2487 lignes monolithiques
- Après: 1950 lignes modulaires (−537 lignes, −21.6%)
- Plus: 2200 lignes de tests (meilleure coverage)

**Imports & Exports:**

```typescript
// src/mcp/handlers/schema-manager.ts
export class SchemaManager {
  hashToolSchema(schema: unknown): string { ... }
  trackToolUsage(toolKey: string): Promise<void> { ... }
  // ...
}

// src/mcp/handlers/tool-search-handler.ts
export interface ToolSearchHandlerConfig {
  vectorSearch: VectorSearch;
  mcpClients: Map<string, MCPClient>;
  capabilityStore?: CapabilityStore;
}

export class ToolSearchHandler {
  constructor(config: ToolSearchHandlerConfig) { ... }
  async handleSearchTools(query: string, options: SearchOptions): Promise<MCPTool[]> { ... }
  async handleSearchCapabilities(query: string, options: SearchOptions): Promise<MCPTool[]> { ... }
}

// src/mcp/handlers/workflow-state-manager.ts
export interface ActiveWorkflow {
  dag: DAGStructure;
  generator: AsyncGenerator<ExecutionEvent>;
  // ... autres champs
}

export class WorkflowStateManager {
  get(id: string): ActiveWorkflow | undefined { ... }
  set(id: string, workflow: ActiveWorkflow): void { ... }
  // ...
}

// src/mcp/gateway-server.ts (après refactoring)
import { SchemaManager } from "./handlers/schema-manager.ts";
import { ToolSearchHandler } from "./handlers/tool-search-handler.ts";
import { CodeExecutionHandler } from "./handlers/code-execution-handler.ts";
import { WorkflowStateManager } from "./handlers/workflow-state-manager.ts";
import { WorkflowOrchestrationHandler } from "./handlers/workflow-orchestration-handler.ts";
import { MCPProtocolHandler } from "./handlers/mcp-protocol-handler.ts";

export class PMLGatewayServer {
  private schemaManager: SchemaManager;
  private toolSearchHandler: ToolSearchHandler;
  private codeExecutionHandler: CodeExecutionHandler;
  private workflowOrchestrationHandler: WorkflowOrchestrationHandler;
  private mcpProtocolHandler: MCPProtocolHandler;

  constructor(...) {
    this.initializeHandlers();
  }

  private initializeHandlers() {
    // Voir section ADR-001 pour détails
  }
}
```

### Testing Strategy

**Pour chaque phase:**

**1. Tests Unitaires**
- Créer tests pour le nouveau module
- Mocker toutes les dépendances
- Tester edge cases
- Viser 80%+ coverage

**2. Tests Existants**
- `deno test tests/unit/mcp/gateway_server_test.ts`
- `deno test tests/e2e/07-gateway.test.ts`
- `deno test tests/integration/mcp_gateway_e2e_test.ts`

**3. Tests de Régression Comportementale**
- Pas de changement de comportement fonctionnel
- Si test échoue: évaluer si c'est un détail d'implémentation ou un vrai bug

**4. Performance Benchmarks (NOUVEAU)**

Créer `tests/benchmarks/gateway_refactor_bench.ts`:

```typescript
import { assertEquals } from "@std/assert";

Deno.bench({
  name: "Baseline: handleListTools (avant refactoring)",
  group: "list-tools",
  baseline: true,
  async fn() {
    // Mesurer temps actuel
    const result = await gatewayServer.handleListTools({});
    assertEquals(result.tools.length > 0, true);
  },
});

Deno.bench({
  name: "After Phase 2: handleListTools (avec ToolSearchHandler)",
  group: "list-tools",
  async fn() {
    // Mesurer après refactoring
    const result = await gatewayServer.handleListTools({});
    assertEquals(result.tools.length > 0, true);
  },
});
```

**Exécution:**
```bash
# Avant chaque phase - capturer baseline
deno bench --allow-all tests/benchmarks/gateway_refactor_bench.ts > baseline-phase1.txt

# Après chaque phase - comparer
deno bench --allow-all tests/benchmarks/gateway_refactor_bench.ts

# Analyser résultats
# Tolérance: ±5% acceptable
# > 10% régression = investigation requise
```

**Métriques à mesurer:**
- Latence handleListTools (P50, P95, P99)
- Latence handleCallTool pour execute_code
- Latence handleWorkflowExecution pour DAG simple (3 tasks)
- Throughput: requêtes/seconde pour search_tools

**Commandes:**
```bash
# Tests unitaires du nouveau module
deno test tests/unit/mcp/schema_manager_test.ts

# Tests gateway existants (doivent continuer à passer)
deno test tests/unit/mcp/gateway_server_test.ts

# Tests E2E complets
deno test tests/e2e/07-gateway.test.ts
deno test tests/integration/mcp_gateway_e2e_test.ts

# Coverage
deno test --coverage=coverage tests/unit/mcp/
deno coverage coverage --lcov > coverage.lcov
```

### Notes

**Risques & Mitigations:**

**1. Concurrence (WorkflowStateManager)**
- ⚠️ **Risque:** Race conditions si 2 requêtes HTTP modifient même workflowId
- ✅ **Mitigation:** Deno est single-threaded, mais async peut causer races
- 🔧 **Solution:** Ajouter mutex/lock par workflowId si nécessaire en Phase 4
- 📝 **Test:** Créer test de concurrence avec 2 handleContinue simultanés

**2. Ordre des événements (Backward Compatibility)**
- ⚠️ **Risque:** Handler peut émettre événements dans ordre différent
- ✅ **Mitigation:** Tests E2E vérifient comportement, pas ordre exact
- 🔧 **Solution:** Si test échoue sur ordre, évaluer si c'est un détail d'implémentation
- 📝 **Principe:** Compatibilité = même résultat final, pas nécessairement même chemin

**3. Tests cassés par détails d'implémentation**
- ⚠️ **Risque:** Tests unitaires mockent nombre exact d'appels aux dépendances
- ✅ **Mitigation:** Identifier tests fragiles avant refactoring
- 🔧 **Solution:** Réécrire tests fragiles pour tester comportement, pas implémentation
- 📝 **Action:** Audit des tests gateway_server_test.ts en Phase 1

**4. Performance non mesurée**
- ⚠️ **Risque:** Refactoring introduit régression latence sans qu'on le sache
- ✅ **Mitigation:** Benchmarks avant/après chaque phase
- 🔧 **Solution:** Ajouter performance tests (voir section ci-dessous)
- 📝 **Target:** ±5% latence tolérée, > 10% = investigation

**5. Rollback Strategy (Phase 4)**
- ⚠️ **Risque:** Phase 4 échoue après 3 jours → code inutilisable
- ✅ **Mitigation:** Feature flag + commits atomiques par sous-tâche
- 🔧 **Solution:**
  ```typescript
  const USE_NEW_WORKFLOW_HANDLER = Deno.env.get("USE_NEW_WORKFLOW_HANDLER") === "true";

  if (USE_NEW_WORKFLOW_HANDLER) {
    await this.workflowOrchestrationHandler.handleWorkflowExecution(...);
  } else {
    // Legacy code path
    await this.handleWorkflowExecution(...);
  }
  ```
- 📝 **Rollback:** Désactiver flag, revert dernier commit, continuer travail

**6. Debugging Cross-Module**
- ⚠️ **Risque:** Bug traverse 3 handlers → difficile à tracer
- ✅ **Mitigation:** Structured logging avec requestId/workflowId
- 🔧 **Solution:** Chaque handler log avec contexte:
  ```typescript
  log.info(`[${workflowId}] ToolSearchHandler: searching for ${query}`);
  log.info(`[${workflowId}] WorkflowOrchestrationHandler: executing layer ${layerIndex}`);
  ```
- 📝 **Tool:** Utiliser existant telemetry/logger.ts avec getLogger()

**7. Réversibilité à Long Terme**
- ⚠️ **Risque:** Découvrir dans 6 mois que séparation était une erreur
- ✅ **Mitigation:** Garder commits atomiques, documentation claire des décisions
- 🔧 **Estimation:** ~2-3 jours pour réunifier modules (plus rapide que création)
- 📝 **Insurance:** ADR-001 documente le "pourquoi" → facilite future décision inverse

**Ordre recommandé d'implémentation:**
1. Phase 1 (Schema) - risque minimal, quick win
2. Phase 2 (Tool Search) - peu de side effects
3. Phase 3 (Code Execution) - isolé, sandboxed
4. Phase 4 (Workflow Orchestration) - **HIGH RISK** - le plus complexe, Control + Execution fusionnés
5. Phase 5 (MCP Protocol) - orchestration finale
6. Phase 6 (Nettoyage)

**Success Metrics:**
- ✅ gateway-server.ts réduit de 2487 → ~400 lignes
- ✅ 5 nouveaux modules + 1 state manager testables indépendamment
- ✅ Tous les tests passent (0 regressions)
- ✅ Coverage > 80% sur les nouveaux modules
- ✅ Maintenabilité améliorée (ajout features plus facile)
- ✅ État partagé géré de manière thread-safe via WorkflowStateManager
- ✅ Performance: ±5% latence (aucune régression > 10%)
- ✅ Debugging: Structured logging avec workflowId dans tous les handlers

---

## 🎯 Principe Fondamental (Pour Futurs Développeurs)

**LA CHOSE à comprendre pour ne pas tout casser:**

> **Gateway-server.ts est un ORCHESTRATEUR, pas un WORKER.**
>
> Il ne fait RIEN lui-même - il délègue tout aux handlers spécialisés.
> Son seul rôle: recevoir requêtes MCP → router vers le bon handler → retourner réponse.

**Règles d'or:**

1. **Jamais de logique métier dans gateway-server.ts**
   - ❌ BAD: `if (tool === "execute_code") { /* 50 lignes de code */ }`
   - ✅ GOOD: `return await this.codeExecutionHandler.execute(request)`

2. **L'état partagé passe TOUJOURS par WorkflowStateManager**
   - ❌ BAD: `this.activeWorkflows.set(id, workflow)` directement
   - ✅ GOOD: `this.workflowState.set(id, workflow)` via manager

3. **Un handler = Une responsabilité = Un fichier**
   - Si tu ajoutes 100 lignes à un handler → réfléchis à l'extraire
   - Si 2 handlers ont besoin du même code → créer un service partagé

4. **Tests: Comporte ment > Implémentation**
   - Teste QUOI (résultat) pas COMMENT (appels internes)
   - Mock le minimum nécessaire

**En cas de doute:**
- 📖 Lire ADR-001 dans cette spec
- 🔍 Chercher des exemples dans les handlers existants
- 💬 Demander review avant de merger des changements dans gateway-server.ts
