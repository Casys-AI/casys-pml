---
title: 'Complete loadByFqdn Migration - Add Integrity Validation'
slug: 'complete-loadbyfqdn-integrity-migration'
created: '2026-01-15'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - Deno 2.x
  - TypeScript strict
files_to_modify:
  - packages/pml/src/loader/capability-loader.ts
code_patterns:
  - fetchWithIntegrity pattern from load() L.224-267
  - IntegrityApprovalRequired handling with continueWorkflow
  - RegistryFetchResult cast for metadata extraction
test_patterns:
  - Manual test: verify mcp.lock entries created after tool use
  - Existing: tests/e2e/integrity_test.ts
  - Existing: tests/lockfile_manager_test.ts
---

# Tech-Spec: Complete loadByFqdn Migration - Add Integrity Validation

**Created:** 2026-01-15

## Overview

### Problem Statement

Migration incomplète de `load()` vers `loadByFqdn()` dans `capability-loader.ts`. La méthode `loadByFqdn()` a été créée pour remplacer `load()` (marquée `@deprecated`) mais la validation d'intégrité (Story 14.7) n'a pas été portée.

Résultat : les tools appelés via `loadByFqdn()` (qui est la méthode utilisée en production via `callWithFqdn()`) ne sont jamais :
- Ajoutés au fichier `mcp.lock`
- Validés contre les entrées existantes
- Soumis à approbation HIL si le hash du serveur MCP a changé

### Solution

Porter le bloc de validation d'intégrité (lignes 224-267) de `load()` vers `loadByFqdn()`. Utiliser `fetchWithIntegrity()` au lieu de `fetchByFqdn()` quand `lockfileManager` est disponible.

### Scope

**In Scope:**
- Modifier `loadByFqdn()` dans `capability-loader.ts`
- Ajouter import `RegistryFetchResult`
- Ajouter appel à `fetchWithIntegrity()` quand `this.lockfileManager` existe
- Gérer `IntegrityApprovalRequired` avec le pattern `continueWorkflow`
- Fallback sur `fetchByFqdn()` si pas de lockfileManager

**Out of Scope:**
- Modifier `registry-client.ts`
- Modifier les méthodes deprecated `load()` / `call()`
- Modifier `lockfile-manager.ts`
- Ajouter de nouveaux tests unitaires (tests e2e existants couvrent le flow)

## Context for Development

### Codebase Patterns

**Pattern de référence dans `load()` (L.224-267) :**

```typescript
let metadata: CapabilityMetadata;

if (this.lockfileManager) {
  const fetchResult = await this.registryClient.fetchWithIntegrity(
    namespace,
    this.lockfileManager,
  );

  if ("approvalRequired" in fetchResult && fetchResult.approvalRequired) {
    const integrityApproval = fetchResult as IntegrityApprovalRequired;

    if (continueWorkflow?.approved === true) {
      const approvedResult = await this.registryClient.continueFetchWithApproval(
        namespace,
        this.lockfileManager,
        true,
      );
      metadata = approvedResult.metadata;
    } else if (continueWorkflow?.approved === false) {
      throw new LoaderError(
        "DEPENDENCY_INTEGRITY_FAILED",
        `User rejected integrity change for ${integrityApproval.fqdnBase}`,
        {
          fqdnBase: integrityApproval.fqdnBase,
          oldHash: integrityApproval.oldHash,
          newHash: integrityApproval.newHash,
        },
      );
    } else {
      return integrityApproval;
    }
  } else {
    metadata = (fetchResult as RegistryFetchResult).metadata;
  }
} else {
  const { metadata: fetchedMetadata } = await this.registryClient.fetchByFqdn(fqdn);
  metadata = fetchedMetadata;
}
```

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `packages/pml/src/loader/capability-loader.ts` | Fichier à modifier - `load()` (L.208-426) comme référence, `loadByFqdn()` (L.539-699) à corriger |
| `packages/pml/src/loader/registry-client.ts` | `fetchWithIntegrity()` (L.491-520), `continueFetchWithApproval()` (L.531-562) |
| `packages/pml/src/loader/types.ts` | `RegistryFetchResult` (L.352) |
| `packages/pml/src/lockfile/types.ts` | `IntegrityApprovalRequired` (L.77-101) |

### Technical Decisions

1. **Réutiliser `fetchWithIntegrity()`** - Accepte les FQDNs (via `toolNameToFqdn()` qui passe les FQDNs avec >2 dots directement)
2. **Copier le pattern exact de `load()`** - Cohérence du codebase, moins de risque d'erreur
3. **Fallback sans lockfile** - Backward compat: si `lockfileManager` null, utiliser `fetchByFqdn()` comme avant
4. **Pas de nouveau type d'erreur** - Réutiliser `DEPENDENCY_INTEGRITY_FAILED` existant

## Implementation Plan

### Tasks

- [ ] **Task 1: Ajouter import RegistryFetchResult**
  - File: `packages/pml/src/loader/capability-loader.ts`
  - Action: Modifier ligne 23 pour ajouter `RegistryFetchResult` à l'import
  - Code:
    ```typescript
    // Avant (L.23)
    import type { ApprovalRequiredResult } from "./types.ts";

    // Après
    import type { ApprovalRequiredResult, RegistryFetchResult } from "./types.ts";
    ```

- [ ] **Task 2: Remplacer le fetch dans loadByFqdn**
  - File: `packages/pml/src/loader/capability-loader.ts`
  - Action: Remplacer lignes 550-554 par le bloc d'intégrité
  - Code avant:
    ```typescript
    logDebug(`Loading capability by FQDN: ${fqdn}`);

    // Fetch metadata directly by FQDN (no conversion, no integrity check)
    // Server already resolved this FQDN, we trust it
    const { metadata } = await this.registryClient.fetchByFqdn(fqdn);
    ```
  - Code après:
    ```typescript
    logDebug(`Loading capability by FQDN: ${fqdn}`);

    // Fetch metadata with integrity validation (Story 14.7)
    let metadata: CapabilityMetadata;

    if (this.lockfileManager) {
      // Use fetchWithIntegrity - accepts FQDNs (toolNameToFqdn passes them through)
      const fetchResult = await this.registryClient.fetchWithIntegrity(
        fqdn,
        this.lockfileManager,
      );

      // Check if integrity approval is required (hash changed)
      if ("approvalRequired" in fetchResult && fetchResult.approvalRequired) {
        const integrityApproval = fetchResult as IntegrityApprovalRequired;

        if (continueWorkflow?.approved === true) {
          // User approved - continue fetch with approval
          const approvedResult = await this.registryClient.continueFetchWithApproval(
            fqdn,
            this.lockfileManager,
            true,
          );
          metadata = approvedResult.metadata;
        } else if (continueWorkflow?.approved === false) {
          // User rejected
          throw new LoaderError(
            "DEPENDENCY_INTEGRITY_FAILED",
            `User rejected integrity change for ${integrityApproval.fqdnBase}`,
            {
              fqdnBase: integrityApproval.fqdnBase,
              oldHash: integrityApproval.oldHash,
              newHash: integrityApproval.newHash,
            },
          );
        } else {
          // Need approval - return the approval request (HIL pause)
          return integrityApproval;
        }
      } else {
        metadata = (fetchResult as RegistryFetchResult).metadata;
      }
    } else {
      // No lockfile manager - fetch without integrity validation (backward compat)
      const { metadata: fetchedMetadata } = await this.registryClient.fetchByFqdn(fqdn);
      metadata = fetchedMetadata;
    }
    ```

- [ ] **Task 3: Vérifier compilation**
  - Action: Exécuter `deno check packages/pml/src/loader/capability-loader.ts`
  - Notes: S'assurer qu'il n'y a pas d'erreurs TypeScript

- [ ] **Task 4: Test manuel**
  - Action: Tester le flow complet
  - Steps:
    1. Vider le lockfile: `echo '{"version":1,"entries":{},"updatedAt":"2026-01-15T00:00:00.000Z"}' > .pml/mcp.lock`
    2. Appeler un tool via pml_execute
    3. Vérifier que `.pml/mcp.lock` a une nouvelle entrée

### Acceptance Criteria

- [ ] **AC1: Nouvelles entrées créées dans mcp.lock**
  - Given: un tool stdio jamais utilisé (pas d'entrée dans mcp.lock)
  - When: le tool est appelé via `callWithFqdn()` → `loadByFqdn()`
  - Then: une entrée est créée dans `.pml/mcp.lock` avec FQDN, integrity hash, et `approved: true`

- [ ] **AC2: Hash match - validation silencieuse**
  - Given: un tool déjà dans mcp.lock avec hash identique au serveur
  - When: le tool est rappelé
  - Then: `lastValidated` est mis à jour, exécution continue sans HIL

- [ ] **AC3: Hash mismatch - HIL approval demandé**
  - Given: un tool dans mcp.lock avec un hash différent du serveur
  - When: le tool est appelé
  - Then: `IntegrityApprovalRequired` est retourné, workflow pause pour HIL

- [ ] **AC4: Backward compat sans lockfileManager**
  - Given: `lockfileManager` est null dans CapabilityLoader
  - When: `loadByFqdn()` est appelé
  - Then: comportement identique à avant (fetchByFqdn sans validation, pas d'erreur)

- [ ] **AC5: Rejection handled**
  - Given: `IntegrityApprovalRequired` retourné précédemment
  - When: `continueWorkflow.approved = false`
  - Then: `LoaderError` avec code `DEPENDENCY_INTEGRITY_FAILED` est thrown

## Additional Context

### Dependencies

- `fetchWithIntegrity()` dans `registry-client.ts` - existant, pas de modification
- `continueFetchWithApproval()` dans `registry-client.ts` - existant, pas de modification
- `LockfileManager` injecté via `CapabilityLoaderOptions` - existant

### Testing Strategy

**Test manuel post-implémentation (obligatoire) :**
1. Vider `mcp.lock`:
   ```bash
   echo '{"version":1,"entries":{},"updatedAt":"2026-01-15T00:00:00.000Z"}' > .pml/mcp.lock
   ```
2. Exécuter un tool via pml_execute:
   ```typescript
   mcp__pml__pml_execute({
     intent: "Get current time",
     code: "return await mcp.std.datetime_now({});"
   })
   ```
3. Approuver si demandé (tool_permission)
4. Vérifier `mcp.lock`:
   ```bash
   cat .pml/mcp.lock | jq '.entries'
   ```
5. Expected: entrée `pml.mcp.std.datetime_now` présente avec hash et `approved: true`

**Tests existants :**
- `tests/e2e/integrity_test.ts` - couvre le flow d'intégrité end-to-end
- `tests/lockfile_manager_test.ts` - couvre la logique lockfile

### Notes

- Le commentaire "Server already resolved this FQDN, we trust it" (L.552-553) était valide quand le spawning était côté serveur, mais plus maintenant
- Story 14.7 définit les ACs originaux : AC11 (new entry), AC12 (hash match), AC14 (hash mismatch)
- Cette correction aligne `loadByFqdn()` avec les exigences de Story 14.7
