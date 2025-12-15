# Tech-Spec: Câblage de l'injection des Capabilities dans pml_execute_code

**Created:** 2025-12-12
**Status:** Completed

## Overview

### Problem Statement

`pml_execute_code` avec un `intent` qui mentionne des tools échoue avec "tools is not defined" et aucune capacité n'est créée.

**Cause racine identifiée :** L'infrastructure d'injection des capabilities existe mais n'est pas câblée dans le flux `handleExecuteCode`. Les capabilities sont trouvées via `searchByIntent` mais ne sont jamais injectées dans le sandbox.

### Solution

Câbler les composants existants pour que :
1. Les tools soient trouvés via `searchToolsHybrid` (déjà fait dans les changements non commités)
2. Les capabilities existantes soient trouvées via `searchByIntent` (déjà fait)
3. Les capabilities soient **injectées dans le sandbox** via `capabilityContext` (À FAIRE)
4. La réponse inclue les `matched_capabilities` (À FAIRE)

### Scope

**In Scope:**
- Ajouter paramètre `capabilityContext` à `executeWithTools`
- Générer le code des capabilities dans `handleExecuteCode`
- Passer le context au `WorkerBridge.execute()`
- Populer `matched_capabilities` dans la réponse

**Out of Scope:**
- Modification du `CapabilityCodeGenerator` (déjà fonctionnel)
- Modification du `SandboxWorker` (déjà prêt à recevoir capabilities)
- Modification de `searchToolsHybrid` (déjà correct)

## Context for Development

### Codebase Patterns

**Pattern d'injection existant** (utilisé dans les tests) :
```typescript
// tests/unit/sandbox/capability_injection_test.ts:114-121
const bridge = new WorkerBridge(mcpClients);
const capabilityContext = bridge.buildCapabilityContext([capability]);
const result = await bridge.execute(
  "return await capabilities.toolCaller({})",
  toolDefs,
  {},
  capabilityContext  // ← 4ème paramètre
);
```

**Génération du code capability** :
```typescript
// src/capabilities/code-generator.ts
// Génère un objet JS avec toutes les capabilities wrappées
const code = codeGenerator.buildCapabilitiesObject(capabilities);
// Résultat: "let __capabilityDepth = 0; const capabilities = { ... };"
```

### Files to Reference

| Fichier | Lignes | Rôle |
|---------|--------|------|
| `src/mcp/gateway-server.ts` | 1197-1452 | `handleExecuteCode` - point d'entrée |
| `src/mcp/gateway-server.ts` | 1257-1276 | Recherche capabilities (déjà fait) |
| `src/mcp/gateway-server.ts` | 1278-1308 | Recherche tools hybrid (déjà fait) |
| `src/mcp/gateway-server.ts` | 1317-1321 | Appel `executeWithTools` (À MODIFIER) |
| `src/sandbox/executor.ts` | 881-993 | `executeWithTools` (À MODIFIER) |
| `src/sandbox/executor.ts` | 949-953 | Appel `bridge.execute` (À MODIFIER) |
| `src/sandbox/worker-bridge.ts` | 174-176 | `buildCapabilityContext` (À UTILISER) |
| `src/sandbox/worker-bridge.ts` | 188-194 | `execute()` signature avec 5 params |
| `src/mcp/types.ts` | 122-129 | Type `matched_capabilities` (déjà ajouté) |

### Technical Decisions

1. **Utiliser `WorkerBridge.buildCapabilityContext`** plutôt que `CapabilityCodeGenerator` directement
   - Raison : Le bridge encapsule déjà le code generator et gère le tracing

2. **Créer le WorkerBridge dans `handleExecuteCode`** pour générer le capabilityContext
   - Alternative rejetée : Passer les capabilities brutes à executor puis au bridge
   - Raison : Le bridge doit être créé pour appeler `buildCapabilityContext()`

3. **Paramètre optionnel** pour backward compatibility
   - `capabilityContext?: string` dans `executeWithTools`
   - Si absent, comportement actuel (tools only)

## Implementation Plan

### Tasks

- [x] **Task 1:** Modifier `executeWithTools` signature dans `executor.ts`
  - Ajouter 4ème paramètre optionnel : `capabilityContext?: string`
  - Passer ce paramètre à `bridge.execute()` (ligne 949-953)

- [x] **Task 2:** Modifier `handleExecuteCode` dans `gateway-server.ts`
  - Après avoir trouvé `matchedCapabilities` (ligne 1276), générer le capabilityContext
  - Créer une instance temporaire de `WorkerBridge` pour appeler `buildCapabilityContext()`
  - OU utiliser directement `CapabilityCodeGenerator.buildCapabilitiesObject()`

- [x] **Task 3:** Passer `capabilityContext` à `executeWithTools`
  - Modifier l'appel ligne 1317-1321 pour inclure le 4ème paramètre

- [x] **Task 4:** Populer `matched_capabilities` dans la réponse
  - Après exécution réussie (ligne 1419+), ajouter les capabilities matchées au response object
  - Mapper `matchedCapabilities` vers le format de réponse défini dans types.ts

- [x] **Task 5:** Tests
  - Vérifier qu'un intent trouve et injecte des capabilities
  - Vérifier que le code utilisateur peut appeler `capabilities.xxx()`
  - Vérifier que `matched_capabilities` est présent dans la réponse

### Acceptance Criteria

- [x] AC 1: Given un intent "search for files", When `pml_execute_code` est appelé, Then les tools pertinents sont trouvés via `searchToolsHybrid`
- [x] AC 2: Given des capabilities existantes matchant l'intent, When `pml_execute_code` est appelé, Then les capabilities sont injectées dans le sandbox
- [x] AC 3: Given des capabilities injectées, When le code utilisateur appelle `capabilities.xxx()`, Then l'appel fonctionne avec tracing
- [x] AC 4: Given une exécution réussie, When la réponse est retournée, Then `matched_capabilities` contient les capabilities trouvées
- [x] AC 5: Given aucune capability matchée, When `pml_execute_code` est appelé, Then le comportement est identique à avant (tools only)

## Additional Context

### Dependencies

- `CapabilityCodeGenerator` - génère le code JS des capabilities
- `WorkerBridge` - exécute le code avec injection
- `CapabilityStore` - stocke et recherche les capabilities

### Testing Strategy

1. **Unit test** : Vérifier que `executeWithTools` passe correctement `capabilityContext` au bridge
2. **Integration test** : Appeler `pml_execute_code` avec un intent, vérifier que capabilities sont disponibles
3. **E2E test** : Créer une capability, puis l'utiliser via intent dans un nouvel appel

### Logging Strategy

**Objectif :** Avoir une visibilité complète sur le flux pour debug et monitoring.

#### Logs à ajouter dans `handleExecuteCode` (gateway-server.ts)

```typescript
// 1. Entrée dans la fonction
log.info("[execute_code] Starting execution", {
  hasIntent: !!request.intent,
  codeLength: request.code.length,
  contextKeys: request.context ? Object.keys(request.context) : [],
});

// 2. Après recherche capabilities (existant mais à enrichir)
log.info("[execute_code] Capability search completed", {
  intent: request.intent?.substring(0, 50),
  capabilitiesFound: matchedCapabilities.length,
  topCapability: matchedCapabilities[0]?.capability.name ?? "none",
  topScore: matchedCapabilities[0]?.semanticScore.toFixed(3) ?? 0,
  allScores: matchedCapabilities.map(c => ({
    name: c.capability.name,
    score: c.semanticScore.toFixed(3),
  })),
});

// 3. Après recherche tools (existant mais à enrichir)
log.info("[execute_code] Tool search completed", {
  intent: request.intent?.substring(0, 50),
  toolsFound: hybridResults.length,
  topTools: hybridResults.slice(0, 3).map(t => t.toolId),
});

// 4. NOUVEAU: Après génération capabilityContext
log.info("[execute_code] Capability context generated", {
  capabilitiesInjected: matchedCapabilities.length,
  capabilityNames: matchedCapabilities.map(c => c.capability.name),
  contextCodeLength: capabilityContext?.length ?? 0,
});

// 5. Avant exécution
log.info("[execute_code] Executing in sandbox", {
  toolDefinitionsCount: toolDefinitions.length,
  hasCapabilityContext: !!capabilityContext,
  executionContextKeys: Object.keys(executionContext),
});

// 6. Après exécution réussie
log.info("[execute_code] Execution completed", {
  success: result.success,
  executionTimeMs: executionTimeMs.toFixed(2),
  toolsCalled: result.toolsCalled?.length ?? 0,
  tracesCount: result.traces?.length ?? 0,
  matchedCapabilitiesReturned: matchedCapabilities.length,
});

// 7. En cas d'échec
log.error("[execute_code] Execution failed", {
  errorType: result.error?.type,
  errorMessage: result.error?.message,
  executionTimeMs: executionTimeMs.toFixed(2),
  hadCapabilities: matchedCapabilities.length > 0,
  hadTools: toolDefinitions.length > 0,
});
```

#### Logs à ajouter dans `executeWithTools` (executor.ts)

```typescript
// 1. Entrée
log.debug("[executeWithTools] Starting Worker execution", {
  codeLength: code.length,
  toolCount: workerConfig.toolDefinitions.length,
  hasCapabilityContext: !!capabilityContext,
  capabilityContextLength: capabilityContext?.length ?? 0,
});

// 2. Après bridge.execute
log.debug("[executeWithTools] Bridge execution completed", {
  success: result.success,
  executionTimeMs: result.executionTimeMs,
  tracesCount: traces.length,
  toolsCalledCount: toolsCalled.length,
});
```

#### Logs existants à conserver dans worker-bridge.ts

Les logs suivants existent déjà et tracent l'exécution des capabilities :
- `capability_start` event via BroadcastChannel
- `capability_end` event via BroadcastChannel
- `tool_start` / `tool_end` events

#### Format de log recommandé

Utiliser le préfixe `[execute_code]` pour faciliter le grep :
```bash
# Pour voir tout le flux
grep "\[execute_code\]" logs.txt

# Pour voir les capabilities spécifiquement
grep "Capability" logs.txt
```

#### Niveaux de log

| Étape | Niveau | Raison |
|-------|--------|--------|
| Entrée/sortie | `info` | Toujours visible, important pour monitoring |
| Recherche capabilities/tools | `info` | Résultats importants à tracer |
| Génération context | `info` | Confirme l'injection |
| Détails bridge | `debug` | Verbose, pour debug uniquement |
| Erreurs | `error` | Toujours visible |

### Notes

**Changements déjà faits (non commités) :**
```diff
# gateway-server.ts
- const toolResults = await this.vectorSearch.searchTools(request.intent, 5, 0.6);
+ const hybridResults = await this.graphEngine.searchToolsHybrid(...)
+ matchedCapabilities = await this.capabilityStore.searchByIntent(request.intent, 3, 0.7);
```

**Architecture du flux après fix :**
```
pml_execute_code(code, intent)
    ↓
handleExecuteCode()
    ├── searchByIntent() → matchedCapabilities[]
    ├── searchToolsHybrid() → toolDefinitions[]
    ├── buildCapabilityContext(matchedCapabilities) → capabilityContext string
    ↓
executeWithTools(code, workerConfig, context, capabilityContext)
    ↓
bridge.execute(code, toolDefs, context, capabilityContext)
    ↓
SandboxWorker receives both tools AND capabilities
    ↓
User code can call:
  - tools.filesystem.read({path: "..."})
  - capabilities.myCapability({...})
```

**Question ouverte :** Faut-il créer un WorkerBridge temporaire juste pour appeler `buildCapabilityContext()` ou utiliser directement `CapabilityCodeGenerator` ?
→ Recommandation : Utiliser `CapabilityCodeGenerator` directement car plus simple et évite de créer un bridge inutile.
