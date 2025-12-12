# Tech-Spec: SSE Real-time Capability Update

**Created:** 2025-12-11
**Status:** ✅ SSE fonctionne - Tests complémentaires à faire
**Story:** 8.3 continuation - SSE incremental updates

## Résumé

Le flux SSE fonctionne correctement pour les capabilities **sans tools**. Les événements `capability.zone.created` sont bien reçus en temps réel par le browser.

## Tests effectués

### ✅ Capability sans tools
- Événement SSE reçu en temps réel
- Hull/zone s'affiche correctement
- Log visible : `[D3Graph] Zone created: cap-xxx - tools: 0`

### ⏳ Capability avec tools (à tester)
- `pml_execute_code` ne passe pas les `toolsUsed` au saveCapability
- Besoin de tester si un hull s'affiche autour des nodes quand `toolIds` n'est pas vide

## Corrections à faire

### 1. Hull avec toolIds - Format vérifié OK
**Vérifié:** Le format des toolIds correspond bien aux node.id du graph.
- Serveur envoie: `"filesystem:read_file"`
- Node.id dans graph: `"filesystem:read_file"` ✅

**Problème réel:** On n'a pas pu tester car toutes les capabilities créées via `pml_execute_code` ont `toolIds: []` (voir point 2).

**Pour tester le hull avec plusieurs tools:**
- Option A: Créer une capability manuellement via API/DB avec des toolIds non-vides
- Option B: Corriger d'abord le tracking des tools dans pml_execute_code

### 2. `pml_execute_code` - tools non appelables dans le sandbox
**Observation:** Les appels `tools.filesystem.xxx()` dans le sandbox échouent silencieusement.

**Fichiers impliqués:**
- `src/sandbox/executor.ts:303` - `toolsUsed: []` (basic execute)
- `src/sandbox/worker-bridge.ts:270` - `toolsUsed: this.getToolsCalled()` (tracks real calls)
- `src/sandbox/context-builder.ts` - Injection des tools via intent

**Flow attendu:**
1. `intent` → ContextBuilder trouve les tools pertinents
2. Tools injectés dans le sandbox comme `tools.serverName.methodName()`
3. Code appelle les tools → tracké par WorkerBridge
4. `saveCapability({ toolsUsed })` → enregistre les tools

**Problème:** Les tools ne sont pas correctement injectés/appelables dans le sandbox de `pml_execute_code`.

**Action:** Investiguer pourquoi les appels tools échouent silencieusement dans le sandbox.

### 3. ✅ `pml_execute_dag` - RÉSOLU (erreur de format)
**Observation initiale:** Les tools dans le DAG échouaient avec `Invalid input: expected string, received undefined`

**Cause réelle:** Mauvais format de paramètres - la doc utilisait snake_case mais le code attend camelCase:
- ❌ `args` → ✅ `arguments`
- ❌ `depends_on` → ✅ `dependsOn`

**Fix appliqué:** Doc corrigée dans `docs/user-docs/api-reference.md`

**Format correct:**
```typescript
{
  "tasks": [{
    "id": "task1",
    "tool": "filesystem:read_file",
    "arguments": { "path": "/path/to/file" },  // NOT "args"
    "dependsOn": []                             // NOT "depends_on"
  }]
}
```

### 4. Test avec toolIds non-vide (À FAIRE)
Le DAG fonctionne maintenant. Reste à tester SSE avec une capability qui a des toolIds non-vides.
Options:
- Option A: Créer une capability manuellement via DB avec des toolIds
- Option B: Corriger le tracking des tools dans `pml_execute_code` (executor.ts:303)

## Flux SSE (Vérifié fonctionnel)

```
execute_code → CapabilityStore.saveCapability()
  → eventBus.emit("capability.zone.created", { capabilityId, label, toolIds, ... })
    → EventsStreamManager.broadcastEvent()
      → SSE: `event: capability.zone.created\ndata: {...}\n\n`
        → Browser EventSource.addEventListener("capability.zone.created")
          → handleZoneCreated() → drawCapabilityHulls()
```

## Fichiers modifiés (Debug logs - à retirer après)

- `src/capabilities/capability-store.ts:228-232` - Log avant emit
- `src/server/events-stream.ts:240-243` - Log avant broadcast
- `src/web/islands/D3GraphVisualization.tsx:409-430` - SSE lifecycle handlers (onopen, onerror)

## Prochaines étapes

1. [ ] Tester SSE avec capability ayant des toolIds non-vides
2. [ ] Vérifier que le hull s'affiche autour des bons nodes
3. [ ] Corriger le tracking des tools dans pml_execute_code si nécessaire
4. [ ] Retirer les logs de debug une fois validé
