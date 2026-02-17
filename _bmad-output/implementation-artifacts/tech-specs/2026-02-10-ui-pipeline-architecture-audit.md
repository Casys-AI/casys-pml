---
title: 'Architecture Audit - MCP Apps UI Pipeline (Epic 16)'
date: '2026-02-10'
type: review
epic: 16
stories: [16.1, 16.2, 16.3, 16.4, 16.6]
status: audit-complete
---

# Architecture Audit - MCP Apps UI Pipeline

## Executive Summary

L'Epic 16 (MCP Apps UI Orchestration) a ete implementee en 6 stories. L'audit revele un **pivot architectural silencieux** entre Story 16.3 et 16.6 qui a casse le circuit de collection UI cote package. Le dashboard (Option A) fonctionne bout en bout, mais le chemin MCP/package (Option B) est entierement deconnecte malgre toutes les briques existantes.

**Principe cle — 3 couches d'UI (cf. section 0) :**
1. **Tool UI HTML** — persistant, servi par le MCP server du tool via `resources/read`
2. **Orchestration config** — persistante, stockee avec la capability en DB (`ui_orchestration`: layout + sync rules)
3. **Composite HTML** — regenere a chaque execution en combinant les Tool UIs collectes + l'orchestration config

| Chemin | Status | Details |
|--------|--------|---------|
| **Option A : Dashboard Fresh** | FONCTIONNEL | Discovery → DB → UiCollector → API → React CompositeUiViewer |
| **Option B : Package MCP (pml serve/stdio)** | PAS BRANCHE | Briques existent, wiring absent |
| **Playground** | PARTIEL (ad-hoc) | `unwrapMcpResult()` extrait `_meta.ui` → widgets, decouple du pipeline |

---

## 0. Principe fondamental : Tool UI vs Composite UI

Il y a **deux niveaux d'UI** dans le pipeline MCP Apps. Tout le reste du document en decoule.

### Tool UI (individuel) — PERSISTANT

Chaque MCP tool qui a une interface visuelle (chart-viewer, table-viewer, json-viewer...) **sert son propre HTML** via le protocole MCP `resources/read`. Ce HTML est compile, statique, et servi par le serveur MCP qui expose le tool.

| Aspect | Detail |
|--------|--------|
| **Ou** | `lib/std/src/ui/dist/` (42 UIs compilees) |
| **Servi par** | Le MCP server du tool, via `resources/read` (protocole MCP standard) |
| **Stockage** | Persistant — le HTML fait partie du serveur MCP |
| **Quand** | Disponible des que le MCP server tourne |
| **Exemple** | `ui://mcp-std/chart-viewer` → HTML de 50KB avec Chart.js |

### Orchestration config (capability) — PERSISTANTE

Quand une capability est apprise (sauvegardee), sa configuration d'orchestration UI est stockee avec elle en DB :

| Aspect | Detail |
|--------|--------|
| **Contenu** | `layout` (split/tabs/grid/stack) + `sync` rules (event routing inter-UI) + `sharedContext` (cles partagees) |
| **Stockage** | `capability_records.ui_orchestration` (JSONB, PostgreSQL) |
| **Type** | `UiOrchestration` (`packages/pml/src/types/ui-orchestration.ts:119`) |
| **Default** | `{"layout": "stack", "sync": []}` |
| **Exemple** | `{"layout": "split", "sync": [{"from": "postgres:query", "event": "filter", "to": "viz:render", "action": "update"}]}` |
| **En DB** | 258 tools avec `ui_meta`, 54 capabilities avec `ui_orchestration` (toutes au default actuellement) |

C'est la "recette" du composite : quels tools interagissent, comment ils sont arranges, quels evenements circulent.

### Composite HTML (execution) — REGENERE A CHAQUE FOIS

A chaque execution d'une capability, on **regenere** le HTML composite en combinant :
1. Les `CollectedUiResource[]` — collectes dynamiquement pendant l'execution (contiennent `_meta.ui.context` avec les donnees de cette invocation)
2. L'`UiOrchestration` — lue depuis la DB (layout + sync rules persistants)

| Aspect | Detail |
|--------|--------|
| **Genere par** | `buildCompositeUi(collected, orchestration)` + `generateCompositeHtml(descriptor)` |
| **Stockage du HTML** | **Aucun** — regenere a chaque execution |
| **Pourquoi pas stocke** | Le `context` des `CollectedUiResource` change a chaque invocation (donnees differentes) |
| **Exemple** | Execution "dashboard ventes Q4" → postgres retourne context `{query: "...WHERE quarter=4"}` + viz retourne context `{chartType: "bar"}` → HTML composite split layout avec ces contextes injectes |

### Implication architecturale : 3 couches

```
PERSISTANT                         REGENERE
┌───────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
│  Tool UI HTML     │   │ Orchestration config  │   │  Composite HTML      │
│  (chart-viewer,   │ + │ (layout, sync rules,  │ + │  (iframes + event    │
│   table-viewer)   │   │  sharedContext)        │   │   bus + contextes)   │
│                   │   │                       │   │                      │
│  Servi via MCP    │   │ Stocke en DB avec     │   │  Genere a la volee   │
│  resources/read   │   │ la capability         │   │  par generateCompo-  │
│  par le MCP       │   │ (ui_orchestration)    │   │  siteHtml()          │
│  server du tool   │   │                       │   │                      │
└───────────────────┘   └──────────────────────┘   └──────────────────────┘
```

`generateCompositeHtml()` produit un HTML autonome destine aux clients MCP externes (Claude Desktop, Cursor, etc.) qui savent resoudre les URIs `ui://` dans les iframes.

Le dashboard (Option A) n'a **pas besoin** de `generateCompositeHtml()` car il gere le composite cote frontend avec React (`CompositeUiViewer.tsx`) et l'AppBridge SDK — mais il **utilise** la meme `UiOrchestration` lue depuis la DB.

---

## 1. Le pivot architectural (Story 16.3 → 16.6)

### Chronologie

| Date | Evenement |
|------|-----------|
| 2026-01-28 | Epic 16 cree, 6 stories planifiees |
| 2026-01-29 | Story 16.3 implementee : UI collection in-sandbox, `extractUiMeta()`, `collectedUi` sur `SandboxExecutionResult`. 20 tests passent, review APPROVED |
| Post 16.3 | **PIVOT SILENCIEUX** : `sandbox-executor.ts` refactore. Commentaires ajoutes : "UI collection is NOT done in the sandbox executor. Per MCP Apps spec (SEP-1865), `_meta.ui.resourceUri` is defined in `tools/list`, not in `tools/call`." Le champ `collectedUi` retire de `SandboxExecutionResult`. La collection deplacee vers `UiCollector` cote serveur |
| 2026-01-29+ | Story 16.6 implementee : `UiCollector` (server-side), route `/api/capabilities/:id/uis`, `CompositeUiViewer.tsx` |

### Le probleme du pivot

Le pivot partait du postulat que `_meta.ui.resourceUri` est **uniquement** dans `tools/list` (discovery-time) et **pas** dans `tools/call` (execution-time). C'est une lecture **incomplete** de SEP-1865.

**En realite, les deux mecanismes coexistent :**

| Source | Quand | Contenu | Usage |
|--------|-------|---------|-------|
| `tools/list` | Discovery | `resourceUri`, `emits`, `accepts` (metadata statique) | Pre-cacher le HTML, savoir si un tool a une UI |
| `tools/call` | Execution | `_meta.ui` avec `resourceUri` + `context` (data dynamique) | Afficher le resultat avec la bonne UI et la bonne data |

La preuve : les tools de `lib/std` retournent effectivement `_meta.ui` dans leurs reponses `tools/call`, et le playground les exploite avec succes via `unwrapMcpResult()`.

### Consequences du pivot

1. **Story 16.3 marquee "done" mais implementation retiree** — les 7 tests TDD dans `sandbox_ui_collection_test.ts` testent un champ `collectedUi` qui n'existe plus dans `SandboxExecutionResult`
2. **`extractUiMeta()` orpheline** — exportee depuis `mod.ts`, jamais importee par quiconque en prod
3. **Package completement deconnecte des UIs** — pas de collection, pas de resource serving
4. **UiCollector serveur-only** — le service fonctionne mais est inaccessible cote package (pas de PostgreSQL)

---

## 2. Les 3 chemins d'acces aux UIs

### Option A : Dashboard Fresh (FONCTIONNEL)

```
[Discovery time]
  schema-extractor.ts
    → MCP client.listTools() → detecte _meta.ui
    → MCP client.readResource(uri) → HTML
    → tool_schema.ui_meta (PostgreSQL)
    → UiCacheService.set() → S3/Garage

[Runtime - clic sur capability]
  CodePanel.tsx useEffect
    → GET /api/capabilities/:id/uis
    → uis.ts route handler
      → UiCollector.collectFromToolsCalled(toolsUsed)
      → query tool_schema.ui_meta (PostgreSQL)
      → Enrichissement: emits, accepts, description
    → Response JSON { collectedUis, uiOrchestration, hasUis }
    → CompositeUiViewer.tsx
      → Pour chaque UI:
        AppBridge + PostMessageTransport
        GET /api/ui/resource?uri=ui://...
        S3 cache → HTML → iframe.srcdoc
        bridge.oninitialized → replay trace results
```

**Fichiers cles :**
- `src/mcp/schema-extractor.ts:143-241` — discovery + cache S3
- `src/services/ui-collector.ts` — collection depuis PostgreSQL
- `src/services/ui-cache-service.ts` — cache S3/Garage
- `src/web/routes/api/capabilities/[id]/uis.ts` — API route
- `src/web/routes/api/ui/resource.ts` — sert le HTML depuis S3
- `src/web/components/ui/CompositeUiViewer.tsx` — rendu React (iframes + AppBridge SDK)
- `src/web/islands/CodePanel.tsx:146-174` — fetch API

**N'utilise PAS `generateCompositeHtml()`** — le frontend gere les iframes directement.

### Option B : Package MCP — pml serve / stdio (PAS BRANCHE)

```
[Discovery]
  mcp-discovery.ts
    → tools/list → extrait uiMeta ✓
    → fetchUiResources() → resources/read → fetch uiHtml ✓
    → syncDiscoveredTools() → envoie uiMeta + uiHtml au cloud ✓
    → ⚠️ NE REGISTRE PAS les resources dans resourceStore local

[Execution]
  serve-command.ts → executeLocalCode() → SandboxExecutor.execute()
    → handleRpcCall() → routeToolCall() → result (contient _meta.ui)
    → ⚠️ extractUiMeta() JAMAIS appelee
    → ⚠️ collectedUi JAMAIS peuple
  → local-executor.ts → retourne { status, result, toolCallRecords }
    → ⚠️ Pas de collectedUi
  → serve-command.ts → response MCP au client
    → ⚠️ Pas de _meta.ui

[Resource serving]
  resourceStore = Map VIDE
  resources/list → retourne []
  resources/read → retourne "not found"
  registerResource() exporte mais JAMAIS appele
```

**Fichiers cles :**
- `packages/pml/src/discovery/mcp-discovery.ts` — discovery (extrait uiMeta, fetch HTML)
- `packages/pml/src/cli/serve-command.ts:68-97` — resourceStore vide
- `packages/pml/src/cli/shared/local-executor.ts` — execution locale
- `packages/pml/src/execution/sandbox-executor.ts` — sandbox (handleRpcCall)
- `packages/pml/src/execution/ui-utils.ts` — extractUiMeta (jamais appelee)
- `packages/pml/src/ui/composite-generator.ts` — buildCompositeUi + generateCompositeHtml (jamais appelees)

### Playground (CHEMIN AD-HOC, PARTIEL)

```
chat.ts → callPml("execute", {...})
  → PML serve → executeLocalCode() → result
  → unwrapMcpResult() → extrait _meta.ui depuis la reponse RPC
  → collectedToolResults[].uiMeta
  → Si uiMeta.resourceUri → widget viewer dedie
  → Sinon → widget agent-chat

TryPlaygroundIsland.tsx
  → inner.widgets[] → WidgetFrame → iframe
```

Completement decouple du pipeline Epic 16. N'utilise ni `UiCollector`, ni `buildCompositeUi()`, ni le `resourceStore`.

---

## 3. Inventaire des briques existantes

### Briques BRANCHEES

| Brique | Fichier | Branche dans |
|--------|---------|-------------|
| Schema extraction + S3 cache | `src/mcp/schema-extractor.ts:200-241` | Dashboard (Option A) |
| UiCollector (query DB) | `src/services/ui-collector.ts` | Route `/api/capabilities/:id/uis` |
| CompositeUiViewer (React) | `src/web/components/ui/CompositeUiViewer.tsx` | CodePanel.tsx |
| Resource serving (S3) | `src/web/routes/api/ui/resource.ts` | Dashboard iframe fetch |
| Discovery uiMeta extraction | `packages/pml/src/discovery/mcp-discovery.ts` | Sync to cloud |
| Discovery HTML fetch | `packages/pml/src/discovery/mcp-discovery.ts:fetchUiResources()` | Sync to cloud |
| MCP server registerResource | `lib/server/src/concurrent-server.ts:483` | lib/std server |
| 42 UIs compilees | `lib/std/src/ui/dist/` | lib/std server resources |

### Briques NON BRANCHEES (fonctionnelles, en attente de wiring)

| Brique | Fichier | Lignes | Pourquoi pas branchee |
|--------|---------|--------|----------------------|
| `extractUiMeta()` | `packages/pml/src/execution/ui-utils.ts` | 55-71 | Pivot 16.3→16.6 |
| `buildCompositeUi()` | `packages/pml/src/ui/composite-generator.ts` | 53-86 | Jamais appelee (dashboard utilise React) |
| `generateCompositeHtml()` | `packages/pml/src/ui/composite-generator.ts` | 406-486 | Idem |
| `registerResource()` (serve) | `packages/pml/src/cli/serve-command.ts` | 76-78 | Discovery ne l'appelle pas |
| `registerResource()` (stdio) | `packages/pml/src/cli/stdio-command.ts` | 72-74 | Idem |
| 7 tests TDD collectedUi | `packages/pml/tests/sandbox_ui_collection_test.ts` | 1-321 | `SandboxExecutionResult.collectedUi` retire |

---

## 4. Divergences de types

### CollectedUiResource — 3 definitions

| Definition | Fichier | Champs specifiques |
|-----------|---------|-------------------|
| Canonique (pml) | `packages/pml/src/types/ui-orchestration.ts:164` | `source`, `resourceUri`, `context?`, `slot` |
| Dashboard (web) | `src/web/types/ui-types.ts:21` | + `toolId?: string` (FQDN pour trace matching) |
| Service (server) | `src/services/ui-collector.ts:48` | Copie independante, memes champs que canonique |

### UiOrchestration — 2 definitions

| Definition | Fichier | Champs specifiques |
|-----------|---------|-------------------|
| Canonique (pml) | `packages/pml/src/types/ui-orchestration.ts:119` | `layout`, `sync?`, `sharedContext?: string[]` |
| Dashboard (web) | `src/web/types/ui-types.ts:39` | `layout`, `sync?`, `panelOrder?: number[]` |

### ToolUiMeta — 3 definitions

| Definition | Fichier | Champs |
|-----------|---------|--------|
| `src/services/ui-collector.ts:62` (prive) | `resourceUri?`, `emits?`, `accepts?` |
| `src/api/types.ts:136` | + `visibility?` |
| `packages/pml/src/discovery/mcp-discovery.ts:37` | + `visibility?` |

### UI Metadata schemas — 3 variants

| Schema | Fichier | Champs |
|--------|---------|--------|
| `McpUiToolMeta` | `packages/pml/src/types/ui-orchestration.ts:304` | `resourceUri?`, `visibility?` |
| `ExtractedUiMeta` | `packages/pml/src/execution/ui-utils.ts:13` | `resourceUri`, `context?` |
| Playground inline | `src/web/routes/api/playground/chat.ts:225` | `resourceUri`, `emits?`, `accepts?` |

**Aucune incompatibilite bloquante**, mais duplication fragile.

---

## 5. Plan de wiring (Option B)

### Gap #1 : resourceStore vide — les Tool UIs individuels ne sont pas servis localement ✅ CORRIGE 2026-02-13

**Cause :** `mcp-discovery.ts:fetchUiResources()` fetche le HTML des Tool UIs individuels (chart-viewer, table-viewer, etc.) mais ne les enregistre que dans le cloud (via `syncDiscoveredTools`). Le `resourceStore` local de `pml serve` n'est jamais alimente.

**Pourquoi c'est un probleme :** Quand un composite HTML est genere, ses iframes chargent les Tool UIs individuels via `src="ui://mcp-std/chart-viewer"`. Le client MCP (Claude Desktop, Cursor) resout ces URIs via `resources/read` aupres de PML. Si le `resourceStore` est vide, les iframes ne chargeront rien.

**Note :** Les Tool UIs sont des artefacts persistants (HTML compile). Les STOCKER dans le `resourceStore` est correct — ce sont les composites qui ne doivent PAS etre stockes (cf. section 0).

**Fix applique (2026-02-13) :**
- `PmlServer.registerUiResource()` : nouvelle methode qui forward vers `ConcurrentMCPServer.registerResource()` (gere doublons silencieusement)
- `serve-command.ts` : apres discovery + sync, itere `discoveryResults.uiHtml[]` et enregistre chaque resource. Aussi dans le config watcher (hot-reload)
- `stdio-command.ts` : meme wiring apres discovery

**Fichiers modifies :**
- `packages/pml/src/server/pml-server.ts` — `registerUiResource()`
- `packages/pml/src/cli/serve-command.ts` — wiring post-discovery + hot-reload
- `packages/pml/src/cli/stdio-command.ts` — wiring post-discovery

**Flow complet :**
```
Discovery → fetchUiResources() → FetchedUiHtml[]
  → syncDiscoveredTools() (cloud) ✅
  → pmlServer.registerUiResource() (local) ✅ NOUVEAU
    → ConcurrentMCPServer.registerResource()
    → resources/read → sert le HTML
```

### Gap #2 : Sandbox ne collecte pas les UIs ✅ CORRIGE 2026-02-10

**Cause :** Pivot 16.3→16.6. Les commentaires disent "collection cote serveur" mais le package n'a pas acces au serveur.

**Fix applique (2026-02-10) :** Re-implementation de la collection in-sandbox :
1. `collectedUi?: CollectedUiResource[]` ajoute a `SandboxExecutionResult`
2. `handleRpcCall()` appelle `extractUiMeta(result)` apres `routeToolCall()`
3. Push dans le tableau avec `source`, `resourceUri`, `context`, `slot`

**Fichiers :** `sandbox-executor.ts`, `execution/types.ts`

### Gap #3 : LocalExecutionResult ne propage pas collectedUi ✅ CORRIGE 2026-02-10

**Cause :** Le type n'a pas de champ UI.

**Fix applique (2026-02-10) :** `collectedUi?: CollectedUiResource[]` ajoute et propage depuis `SandboxExecutionResult`.

**Fichiers :** `cli/shared/types.ts`, `local-executor.ts`

### Gap #4 : Composite HTML jamais genere ✅ CORRIGE 2026-02-10

**Cause :** `buildCompositeUi()` et `generateCompositeHtml()` existent mais personne ne les appelle.

**Fix applique (2026-02-10) :** `buildMcpSuccessResult()` dans `response-builder.ts` :
1. 0 UIs : pas de `_meta`
2. 1 UI : pass-through `_meta.ui = { resourceUri, context }`
3. 2+ UIs : `buildCompositeUi()` + `generateCompositeHtml()` → `_meta.ui = { resourceUri, html }`
4. Retourner le HTML **directement dans la reponse MCP** via `_meta.ui`

**Le HTML composite est REGENERE a chaque execution.** Il combine l'orchestration config (persistante, en DB) avec les `CollectedUiResource` (dynamiques, collectes pendant cette execution). Le HTML ne doit **PAS** etre enregistre dans le `resourceStore` (contrairement aux Tool UIs individuels, cf. Gap #1).

**Concretement dans la reponse MCP :**
```json
{
  "content": [{ "type": "text", "text": "..." }],
  "_meta": {
    "ui": {
      "resourceUri": "ui://pml/composite/inline",
      "html": "<html>...composite...</html>"
    }
  }
}
```

Le client peut soit afficher le HTML inline directement, soit resoudre les iframes individuels via `resources/read` (Gap #1).

**Fichiers :** `serve-command.ts`, `stdio-command.ts`, `local-executor.ts`

**Complexite : M**

### Gap #5 : execute_locally ne contient pas les UIs pre-resolues

**Cause :** Quand le serveur retourne `execute_locally`, il connait deja `toolsUsed` et a acces a PostgreSQL, mais n'inclut pas les UIs dans la reponse.

**Fix :** Dans `execute-direct.use-case.ts:420-452`, ajouter `collectedUis` (via `UiCollector`) et `uiOrchestration` a la reponse `execute_locally`.

**Fichiers :** `execute-direct.use-case.ts`

**Complexite : M**

### Ordre d'execution — STATUT FINAL

```
Gap #1 (resourceStore Tool UIs)  ✅ CORRIGE 2026-02-13 — PmlServer.registerUiResource() post-discovery
Gap #2 (sandbox collect)         ✅ CORRIGE 2026-02-10 — extractUiMeta() dans handleRpcCall()
Gap #3 (propagation)             ✅ CORRIGE 2026-02-10 — collectedUi dans LocalExecutionResult
Gap #4 (composite ephemere)      ✅ CORRIGE 2026-02-10 — buildMcpSuccessResult() genere composite
Gap #5 (execute_locally)         ❌ NON CORRIGE — optimisation serveur, independant du chemin package
```

- **Option B (MCP package) : COMPLET** — les 4 gaps du chemin critique sont corriges
- **Gap #5** reste une optimisation serveur pour le dashboard (non bloquant)

---

## 6. Decision architecturale : Les deux approches coexistent

**Decision :** NE PAS choisir entre `tools/list` (statique) et `tools/call` (dynamique). Les deux servent des buts differents et doivent coexister.

| Approche | Sert a | Contexte |
|----------|--------|----------|
| **Statique (tools/list → DB)** | Pre-cacher HTML, savoir si un tool a une UI, orchestration dashboard | Dashboard (Option A), `execute_locally` pre-resolution |
| **Dynamique (tools/call → extract)** | Collecter les UIs pendant l'execution, generer composite HTML | Package MCP (Option B), playground |

Le commentaire dans `sandbox-executor.ts:11-22` ("UI collection is NOT done in the sandbox executor") doit etre **retire** et remplace par la logique de collection originale de Story 16.3.

### Erreur recurrente a eviter

Le rapport d'audit serveur (equipe architecture, 2026-02-10) contenait cette affirmation **incorrecte** :

> "Per MCP spec, `tools/call` does NOT return UI metadata"

C'est faux. `tools/call` **peut** retourner `_meta.ui` dans sa reponse — et les tools de `lib/std` le font effectivement. Le playground l'exploite deja avec succes via `unwrapMcpResult()`. Cette meme lecture incorrecte de SEP-1865 est ce qui a cause le pivot silencieux de Story 16.3 → 16.6. Ne pas reproduire cette erreur.

### Separation des responsabilites

Le rapport d'equipe a correctement identifie que :

1. **CapabilityLoader** (package) est un **pass-through** — il retourne exactement ce que les tools retournent, sans transformation. C'est correct : c'est au layer au-dessus (serve-command, local-executor) de collecter les `_meta.ui` et generer le composite.

2. **ExecuteDirectUseCase** (serveur) **ignore les UIs** — il se concentre sur l'execution, les traces, et le learning. La collection UI est decouplée dans `UiCollector` (server-side). C'est aussi correct pour le dashboard.

3. **Pas de duplication fonctionnelle** entre package et serveur — les deux chemins gerent des cas de routing differents (client-routed vs server-routed).

---

## 7. Corrections documentaires

### Story 16.3 : Mettre a jour le status

Le status actuel est "done" avec "20 tests passing, APPROVED". En realite :
- L'implementation a ete retiree apres la review
- Les 7 tests TDD ne compilent plus (le champ teste n'existe plus)
- Le helper `extractUiMeta()` est orphelin

**Action :** Changer le status de "done" a "regressed — reimplementation requise"

### Story 16.6 : Documenter les limites

La Story 16.6 a implemente `UiCollector` mais uniquement cote serveur/dashboard. Le package n'a pas d'equivalent. La collection server-side fonctionne pour le dashboard mais ne resout pas le besoin du package.

---

## 8. Metriques de l'audit

| Metrique | Valeur |
|----------|--------|
| Fichiers audites | 28 |
| Lignes de code non branche (fonctionnel) | ~900 (ui-utils + composite-generator + tests) |
| Definitions de types dupliquees | 9 (3 CollectedUiResource + 3 ToolUiMeta + 3 UI metadata) |
| Tests rouges/non-compilants | 7 (sandbox_ui_collection_test.ts) |
| Gaps de wiring identifies | 5 |
| Gaps corriges | 4/5 (Gap #1-#4 corriges, Gap #5 = optimisation serveur non bloquante) |
| Stories marquees "done" mais regressees | 1 (Story 16.3 — re-implementee 2026-02-10) |

---

## Annexe : MCP servers et UIs disponibles

### lib/std

- **42 UIs compilees** dans `lib/std/src/ui/dist/`
- **~80+ tools** avec `_meta.ui.resourceUri`
- **6 URIs uniques principaux** : `ui://mcp-std/json-viewer`, `table-viewer`, `map-viewer`, `chart-viewer`, `status-badge`, `form-viewer`
- Enregistrement : `lib/std/server.ts:87-118` via `ConcurrentMCPServer.registerResource()`

### DB Schema

- `tool_schema.ui_meta` : JSONB nullable, migration 044
- `capability_records.ui_orchestration` : JSONB, default `{"layout":"stack","sync":[]}`, migration 046
- Index partiel : `idx_tool_schema_has_ui WHERE ui_meta IS NOT NULL`
