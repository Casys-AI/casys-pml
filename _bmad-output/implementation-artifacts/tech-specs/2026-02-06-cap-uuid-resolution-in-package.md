# Tech Spec: $cap:UUID Resolution via Server-Side Code Transformation

**Date:** 2026-02-06
**Status:** Fix 1 + Fix 2 + Fix 3 DONE — Fix 4 (validation args) EN COURS
**Severity:** High — all meta-capabilities (hierarchy_level >= 1) are broken in package
**Scope:** Server-side + Package-side

## Problem

Meta-capabilities use `mcp["$cap:<uuid>"](args)` in their `code_snippet` to call other capabilities by stable UUID (resilient to renames). This works on the **server sandbox** (`src/sandbox/rpc-router.ts:124`) but **fails in the PML package sandbox** because the package doesn't support `$cap:` resolution.

**Error:** `mcp.$cap:9f597aff-... is not a function`

### Root Cause (sandbox)

The PML package sandbox (`packages/pml/src/sandbox/execution/sandbox-script.ts`) only supports `mcp.namespace.action(args)` format (2-level Proxy). When code does `mcp["$cap:UUID"]()`:

1. The Proxy returns an **object** (namespace level), not a function
2. Calling `()` on the object → **TypeError: not a function**

The package has no access to `capabilityRegistry.getById()` for UUID resolution.

### Affected Capabilities

All meta-capabilities in DB with `code_snippet` containing `$cap:UUID` references:

| Capability | $cap refs | Status |
|------------|-----------|--------|
| meta:personWithAddress | 2 refs | BROKEN |
| meta:identity | 2 refs | BROKEN |
| meta:composedProfile | 3 refs | BROKEN |
| meta:fullProfile | 3 refs | BROKEN |
| meta:compositeProfile | 3 refs | BROKEN |

Capabilities calling raw MCP tools (`mcp.std.data_person()`) work fine.

## Solution: Server-Side Code Transformation

### Principle

The DB stores `$cap:UUID` references (stable, rename-resilient). The **server** resolves them to `mcp.namespace.action()` format **at serve time**. The package receives pre-resolved code that works with the existing 2-level Proxy.

```
DB stores:     mcp["$cap:9f597aff-..."](args)
Server serves: mcp.fake.person(args)        ← resolved at serve time
Package sees:  mcp.fake.person(args)        ← works with existing Proxy
```

### Why This Approach

| Approach | Verdict | Reason |
|----------|---------|--------|
| ~~Package sandbox fix ($cap: Proxy)~~ | Rejected | Package would still need UUID→name resolution, which requires DB access it doesn't have |
| ~~Package routeMcpCall fix~~ | Rejected | Same problem — needs UUID resolution |
| ~~New registry endpoint /id/:uuid~~ | Rejected | Extra HTTP round-trip per $cap ref at runtime |
| **Server pre-resolves at serve time** | **Selected** | Server has DB access, no package changes, rename-resilient (resolves to CURRENT name) |

### Benefits

- **Zero package changes** — existing `mcp.namespace.action()` flow handles everything
- **DB stays stable** — `$cap:UUID` in code_snippets survives renames
- **Always current** — server resolves to the name at serve time, not at write time
- **Consistent** — same code format arrives whether capability uses UUIDs or direct names

## Implementation

### Fix 1: resolveCapRefs in getCode() — DONE

**File:** `src/mcp/registry/mcp-registry.service.ts`

Added `resolveCapRefs()` private method that:
1. Scans `code_snippet` for `$cap:UUID` patterns
2. Queries `capability_records WHERE id = $uuid` → gets `namespace`, `action`
3. Replaces `mcp["$cap:UUID"]` with `mcp.namespace.action`

Called from `getCode()` before returning the code_snippet to the package.

**Tested:** UUID resolution works — `$cap:9f597aff-...` correctly resolved to `fake:person`.

### Fix 2: Scope-Aware Resolution in `/api/registry/` — DONE

**Problem:** After Fix 1, the resolved code calls `mcp.fake.person()`. The package sends this as RPC to `routeMcpCall` → `registryClient.fetch("fake:person")` → `toolNameToFqdn` → `pml.mcp.fake.person` → `GET /api/registry/pml.mcp.fake.person` → NOT FOUND.

The capability in DB has FQDN `local.default.fake.person.c41e`, not `pml.mcp.fake.person`.

**Solution:** Added scope-aware `resolveByName` to the registry API endpoint — same resolution strategy as `rpc-router.ts` and `CapabilityRegistry.resolveByName`.

**Files Modified:**

1. `src/mcp/registry/mcp-registry.service.ts` — Added public `resolveByName(name, scope)` method:
   - Takes `namespace:action` format and `{ org, project }` scope
   - Query 1: `WHERE org=$scope.org AND project=$scope.project AND namespace=$ns AND action=$act`
   - Query 2: `WHERE namespace=$ns AND action=$act AND visibility='public'`
   - Returns enriched `McpRegistryEntry` or null

2. `src/api/mcp-registry.ts` — Modified `handleMcpRegistryGet()`:
   - When 4-part FQDN exact match fails (`getCurrentFqdn` returns null)
   - Extracts `namespace:action` from the FQDN parts
   - Calls `service.resolveByName(name, { org: ctx.userOrg, project: ctx.userProject })`
   - If resolved, redirects to the correct FQDN (standard 302 redirect flow)

**Resolution flow:**
```
Package: GET /api/registry/pml.mcp.fake.person (4-part)
Server:
  1. getCurrentFqdn("pml.mcp.fake.person") → null (exact match fails)
  2. resolveByName("fake:person", { org: "local", project: "default" })
     → SELECT * FROM pml_registry WHERE org='local' AND project='default' AND namespace='fake' AND action='person'
     → FOUND: local.default.fake.person.c41e
  3. 302 Redirect → /api/registry/local.default.fake.person.c41e
  4. Package follows redirect → gets correct metadata
```

**Why this approach:**
- **Zero package changes** — package still sends `pml.mcp.*`, server resolves correctly
- **Same strategy as server sandbox** — mirrors `rpc-router.ts:238` resolution
- **Scope from auth** — `RouteContext` already has `userOrg`/`userProject` from auth token
- **Multi-tenant ready** — scope comes from the authenticated user, not hardcoded

### How the server sandbox resolves (reference)

```typescript
// src/sandbox/rpc-router.ts:236-241
const scope = await getUserScope(this.config.userId ?? null);
const record = await capabilityRegistry.resolveByName("fake:person", scope);
// → Tries user scope first, then public visibility
```

## Testing

### Expected flow after both fixes

```
mcp.meta.personWithAddress({})
  → $cap:UUID resolution: OK ✓ (resolved to fake:person via resolveCapRefs)
  → Loading fake:person via registry: OK ✓ (scope-aware resolveByName)
  → Execution: OK ✓
```

### Fix 3: Integrity Approval Loop — DONE

**Problem:** Après Fix 1+2, les meta-capabilities s'exécutent mais les appels imbriqués déclenchent des `integrity` approval. Après approbation, le lockfile n'est jamais mis à jour → boucle infinie d'integrity approval.

**Root Cause:** `serve-command.ts:389-394` ne gérait que `tool_permission` et `api_key_required`, PAS `integrity`. Sans mise à jour du lockfile, le même integrity check se re-déclenche à chaque re-exécution.

**Solution:**

1. `packages/pml/src/loader/capability-loader.ts` — Ajout `approveIntegrityForSession(toolId)` :
   - Appelle `registryClient.continueFetchWithApproval(toolId, lockfileManager, true)`
   - Met à jour le lockfile AVANT la re-exécution

2. `packages/pml/src/cli/serve-command.ts` — Ajout handler integrity :
   - Utilise `pending.integrityInfo?.fqdnBase` (ex: `pml.mcp.std.data_address`) et NON `pending.toolId` (ex: `fake:address`)
   - `toolId` = la capability en cours de chargement, `fqdnBase` = le tool MCP sous-jacent avec le changement d'intégrité

**Subtilité toolId vs fqdnBase :** Le `pending.toolId` est la capability demandée (ex: `fake:address`), mais l'integrity change concerne le tool MCP sous-jacent (ex: `pml.mcp.std.data_address`). Premier fix utilisait `toolId` → ne matchait pas → boucle persistait. Corrigé en utilisant `integrityInfo.fqdnBase`.

**Testé:** Approbation integrity → lockfile mis à jour → pas de boucle ✓

### Fix 4: Permissions des appels imbriqués — BUG MAJEUR IDENTIFIÉ

> **FINDING CRITIQUE : Le sandbox ne gère PAS les ApprovalRequired des appels imbriqués.**
> Quand une meta-capability appelle `mcp.fake.person({})` et que ce tool n'est pas encore approuvé,
> `routeMcpCall` retourne `{ approvalRequired: true, ... }` — mais le sandbox traite ça comme
> une donnée normale au lieu de pauser l'exécution. Le résultat final mélange données réelles
> et objets d'approbation.

**Symptôme observé :**
```json
{
  "firstName": "Mireya", "lastName": "Jerde", ...  // ← person OK (tool approuvé)
  "address": {
    "approvalRequired": true,                       // ← address FAIL (pas approuvé)
    "approvalType": "tool_permission",
    "toolId": "fake:address", ...
  }
}
```

**Root Cause :**

Le flux d'exécution imbriqué ne peut PAS interrompre le sandbox pour demander une approbation :

```
meta:personWithAddress sandbox (Worker isolé)
  → mcp.fake.person({})     ← RPC → routeMcpCall → this.call()
                                      ↓
                              Si pas approuvé : retourne { approvalRequired: true }
                              Le sandbox reçoit ça comme "résultat" normal
                              → person = { approvalRequired: true, ... }
                              → Le code continue au lieu de pauser
```

**Pourquoi :** Le `onRpc` callback (capability-loader.ts:1034) n'a aucun mécanisme pour :
1. Détecter qu'un appel imbriqué retourne `ApprovalRequired`
2. Interrompre le sandbox Worker en cours
3. Sauvegarder l'état pour reprise après approbation

**Comparaison avec le serveur :** Le server sandbox (`rpc-router.ts`) ne pose PAS ce problème car :
- Le serveur exécute dans un contexte où tous les tools sont déjà disponibles (pas de permissions)
- Pas de mécanisme d'approbation HIL dans le server sandbox

**Impact :** Toute meta-capability dont un sous-appel nécessite une approbation (tool_permission, integrity, api_key) retourne un résultat corrompu mélangeant données et objets d'approbation.

**Workaround actuel :** Si tous les tools sont pré-approuvés (via `allow: ["*"]` ou appels directs préalables), la meta-capability fonctionne correctement.

**Solutions possibles :**

| Approche | Complexité | Description |
|----------|-----------|-------------|
| **A: Pré-approval scan** | Faible | Avant d'exécuter une meta-capability, scanner le code résolu pour extraire tous les `mcp.X.Y()` calls, pré-charger chaque outil (déclencher les approbations), puis exécuter seulement quand tout est approuvé |
| **B: onRpc throw + retry** | Moyenne | Quand `onRpc` détecte un `ApprovalRequired`, throw une erreur spéciale → sandbox échoue → le facade retourne l'approval → après approbation, re-exécute toute la meta-capability |
| **C: Suspension sandbox** | Haute | Implémenter un vrai mécanisme de pause/reprise du Worker sandbox (SharedArrayBuffer + Atomics.wait) |

**Recommandation : Option A** — scan + pré-approval. Zéro changement au sandbox, réutilise `this.load()` pour chaque tool référencé dans le code.

## Impact

- **Fix 1 (done):** No breaking changes — adds `$cap:UUID` → `namespace:action` transformation in getCode()
- **Fix 2 (done):** No breaking changes — adds scope-aware resolution when exact FQDN match fails in `/api/registry/`
- **Fix 3 (done):** No breaking changes — adds integrity lockfile update before re-execution
- **Fix 4 (en cours):** Validation args dans exécution imbriquée de meta-capabilities
 ja i de