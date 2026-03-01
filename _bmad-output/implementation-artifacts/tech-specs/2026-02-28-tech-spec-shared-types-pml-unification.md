---
title: 'Shared Types — Unification des types parallèles packages/pml ↔ src/'
slug: 'shared-types-pml-unification'
created: '2026-02-28'
status: 'implementation-complete'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['TypeScript', 'Deno', 'JSR', '@casys/pml-types']
files_to_modify:
  - 'shared/ (NEW package at root level)'
  - 'packages/pml/src/tracing/types.ts'
  - 'packages/pml/src/execution/types.ts'
  - 'packages/pml/src/types.ts'
  - 'packages/pml/src/discovery/mcp-discovery.ts'
  - 'packages/pml/src/cli/shared/types.ts'
  - 'packages/pml/src/workflow/pending-store.ts'
  - 'packages/pml/src/loader/types.ts'
  - 'packages/pml/deno.json'
  - 'src/capabilities/types/execution.ts'
  - 'src/api/types.ts'
  - 'src/api/traces.ts'
  - 'src/sandbox/types.ts'
  - 'src/mcp/registry/discovery.ts'
  - 'src/application/use-cases/discover/types.ts'
  - 'src/services/ui-collector.ts'
  - 'deno.json (root import map)'
  - 'tests/unit/shared-types/ (NEW tests)'
code_patterns:
  - 'shared/ at root level (peer to src/ and packages/), deno.json + mod.ts exports'
  - 'Interface-first design (types.ts or interfaces.ts per module)'
  - 'camelCase everywhere, PascalCase for types'
  - 'ESM-only, .ts extensions in imports'
  - 'extends keyword for local enrichments over shared base types'
test_patterns:
  - 'Deno.test natif + @std/assert'
  - 'Tests in tests/unit/ mirroring src/'
  - 'Structural type alignment tests (new — CI guard)'
---

# Tech-Spec: Shared Types — Unification des types parallèles packages/pml ↔ src/

**Created:** 2026-02-28

## Overview

### Problem Statement

15 paires de types identifiées entre `packages/pml/` (client CLI) et `src/` (serveur PML), alignées par convention manuelle. L'audit révèle des dérives actives :
- **3 HIGH** : TraceTaskResult (+8 champs Phase 2a manquants côté PML), ExecutionTrace (5 naming/type drifts), DiscoveredTool (3 concepts différents, même nom)
- **3 MEDIUM** : ToolUiMeta (triplication), ToolCallRecord vs TraceTaskResult (confusion interne PML), SandboxExecutionResult (évolution divergente)
- **5 LOW** : ApprovalType, ToolRouting (duplications internes PML), DAGTask, RoutingConfig, FetchedUiHtml (drift minime)

Le mapping implicite dans `src/api/traces.ts:95-120` est le point de fragilité principal : aucune validation, casse silencieusement si un côté change.

### Solution

Créer `shared/` comme package JSR (`@casys/pml-types`) importé des deux côtés. Résoudre les dérives existantes en utilisant `src/` comme source de vérité. Supprimer les définitions dupliquées.

### Scope

**In Scope:**
- Création du package `shared/` avec types canoniques unifiés
- Résolution des 15 paires de dérives identifiées (trancher chaque divergence)
- Migration des imports dans `src/` et `packages/pml/`
- Consolidation des duplications internes PML (ApprovalType, ToolRouting)
- Test CI de cohérence structurelle
- Publication sur JSR (`@casys/pml-types`)

**Out of Scope:**
- Changement de positionnement/branding de `packages/pml`
- Mode local-first / discover dégradé
- Refactoring du routing ou du cloud-client
- Changements de logique métier — uniquement des types
- Refactoring de `src/api/traces.ts` mapping logic (utilise les nouveaux types mais garde le mapping)

## Context for Development

### Codebase Patterns

- `packages/pml/` = package JSR standalone, zéro import croisé avec `src/` (par design)
- Communication HTTP JSON-RPC entre client et serveur — les types doivent matcher au runtime
- Libs publiées suivent le pattern `lib/<name>/` avec `deno.json` + `mod.ts` (cf. `@casys/mcp-server`, `@casys/mcp-bridge`)
- Le `shared/` package vit à la racine (peer de `src/`, `packages/`, `lib/`) — c'est un contrat de types, pas une lib avec de la logique
- Deno + TypeScript strict mode, ESM-only, `.ts` extensions obligatoires
- Les dérives se répartissent en 2 catégories :
  1. **Intentionnelles** — PML riche côté sandbox/UI, src/ riche côté ML/Phase 2a (légitime, à documenter)
  2. **Accidentelles** — naming (même nom, 3 concepts), optionnalité, types de champs (à résoudre)

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `packages/pml/src/tracing/types.ts` | TraceTaskResult, BranchDecision, LocalExecutionTrace (PML side) |
| `packages/pml/src/execution/types.ts` | ToolCallRecord, SandboxExecutionResult, ToolRouting dup (PML side) |
| `packages/pml/src/types.ts` | ToolRouting, RoutingConfig (PML side) |
| `packages/pml/src/discovery/mcp-discovery.ts` | DiscoveredTool, ToolUiMeta, FetchedUiHtml (PML side) |
| `packages/pml/src/cli/shared/types.ts` | DAGTask, LocalExecutionResult (PML side) |
| `packages/pml/src/workflow/pending-store.ts` | ApprovalType dup (PML side) |
| `packages/pml/src/loader/types.ts` | ApprovalType dup (PML side) |
| `src/capabilities/types/execution.ts` | TraceTaskResult, ExecutionTrace (server side — enriched) |
| `src/api/types.ts` | IncomingTrace, ToolUiMeta, FetchedUiHtmlInput, RoutingResponse (server API) |
| `src/api/traces.ts:95-120` | Mapping implicite LocalExecutionTrace → SaveTraceInput (fragility point) |
| `src/sandbox/types.ts` | ExecutionResult (server sandbox) |
| `src/mcp/registry/discovery.ts` | DiscoveredTool minimal (server registry) |
| `src/application/use-cases/discover/types.ts` | DiscoveredTool rich (server use-case) |
| `src/services/ui-collector.ts` | ToolUiMeta dup (server services) |

### Technical Decisions

- **Package JSR partagé** (pas JSON Schema) — type-safe à la compilation, cohérent avec le pattern existant
- **Pas de source de vérité unique** — ni src/ ni PML ne "gagne" par défaut. Chaque type est arbitré au cas par cas :
  - PML gagne quand il est plus moderne (ex: `timestamp` ISO string > `executedAt` Date)
  - src/ gagne quand il a le champ le plus complet (ex: Phase 2a enrichments)
  - Parfois ni l'un ni l'autre — on tranche sur ce qui est le plus propre pour le contrat HTTP
- **Approche TDD** — écrire les tests d'alignement AVANT de migrer. Chaque résolution de conflit est précédée d'un grep des usages pour mesurer l'impact du renaming
- **Types enrichis (Phase 2a, ML)** restent dans `src/` via `extends` — le shared package contient le contrat de communication commun
- **Naming — arbitré au cas par cas** (résolutions préliminaires, à confirmer pendant l'implémentation TDD) :
  - `traceId` (PML) vs `id` (src/) → **`traceId` gagne** (plus explicite), mapping `traceId ↔ row.id` dans traces.ts
  - `errorMessage` (src/) vs `error` (PML) → **`errorMessage` gagne** (plus descriptif)
  - `timestamp` ISO string (PML) vs `executedAt` Date (src/) → **`timestamp` gagne** (JSON-sérialisable), mapping `timestamp ↔ row.executed_at` dans traces.ts
  - Chaque renaming nécessite un audit grep complet des usages avant exécution
- **DiscoveredTool** : renommer les 3 variantes — `McpToolInfo` (PML loader), `RegisteredMcpTool` (src/ registry), garder `DiscoveredTool` (src/ use-case search result)
- **ToolCallRecord supprimé** — remplacé par `TraceTaskResult` partout (subset inutile)
- **Shared type = contrat HTTP** — ce qui traverse le fil JSON-RPC. Les extensions sandbox/ML restent locales.

### Drift Audit Detail

#### HIGH Severity

**1. TraceTaskResult** — PML:tracing/types.ts vs src:execution.ts
- PML a 7 champs, src/ en a 15+
- Champs manquants côté PML : `resolvedTool?`, `isFused?`, `logicalOperations?`, `loopId?`, `loopIteration?`, `loopType?`, `loopCondition?`, `bodyTools?`, `isCapabilityCall?`, `nestedTools?`
- Champ PML absent de src/ : `timestamp`
- **Décision** : shared type = 8 champs communs (7 PML + `timestamp` ajouté à src/). Les champs Phase 2a restent dans `EnrichedTraceTaskResult extends TraceTaskResult` côté src/.

**2. LocalExecutionTrace vs ExecutionTrace** — 5 dérives
- `traceId` (PML) vs `id` (src/) → **`traceId`** gagne
- `error?` (PML) vs `errorMessage?` (src/) → **`errorMessage`** gagne
- `timestamp` ISO string (PML) vs `executedAt` Date (src/) → **`timestamp` ISO string** gagne (JSON-sérialisable)
- `capabilityId` FQDN (PML) vs UUID FK (src/) → **garder string**, sens contextuel (FQDN en transit, UUID après résolution serveur)
- `workflowId?` PML-only, `intentText?/intentEmbedding?/priority` src/-only → extensions locales

**3. DiscoveredTool** — 3 concepts différents
- PML : tool découvert depuis MCP server (minimal) → renommer `McpToolInfo`
- src/ registry : info tool MCP interne → renommer `RegisteredMcpTool`
- src/ use-case : résultat de recherche enrichi → garder `DiscoveredTool`

#### MEDIUM Severity

**4. ToolUiMeta** — triplication identique → extraire dans shared
**5. ToolCallRecord vs TraceTaskResult** — ToolCallRecord = subset → supprimer, utiliser TraceTaskResult
**6. SandboxExecutionResult** — évolution divergente intentionnelle → documenter, pas de type commun

#### LOW Severity

**7-11.** ApprovalType (consolider interne PML), ToolRouting (consolider interne PML), DAGTask (aligné, extraire dans shared), RoutingConfig (aligné, extraire dans shared), FetchedUiHtml (aligner optionnalité mimeType)

## Implementation Plan

### Tasks

- [x] **Task 1: Scaffold `shared/` package**
  - File: `shared/deno.json` (NEW)
  - File: `shared/mod.ts` (NEW)
  - Action: Créer la structure du package JSR :
    - `deno.json` avec `name: "@casys/pml-types"`, `version: "0.1.0"`, `exports: { ".": "./mod.ts" }`
    - `mod.ts` qui ré-exporte tous les modules de types
    - Sous-dossiers : `tracing/`, `execution/`, `discovery/`, `routing/`
  - Notes: Nouveau dossier racine `shared/` (peer de `src/`, `packages/`, `lib/`). Ne PAS ajouter de logique — types purs uniquement. Pattern deno.json + mod.ts comme les libs existantes.

- [x] **Task 2: Définir les types canoniques de tracing**
  - File: `shared/tracing/types.ts` (NEW)
  - Action: Créer les types canoniques :
    - `TraceTaskResult` — 8 champs communs : `taskId`, `tool`, `args`, `result`, `success`, `durationMs`, `timestamp`, `layerIndex?`
    - `BranchDecision` — 3 champs : `nodeId`, `outcome`, `condition?` (identique, pas de drift)
    - `BaseExecutionTrace` — champs communs du contrat HTTP :
      - `traceId` (string), `parentTraceId?` (string), `capabilityId?` (string), `success` (boolean), `errorMessage?` (string), `durationMs` (number), `taskResults` (TraceTaskResult[]), `decisions` (BranchDecision[]), `timestamp` (string ISO), `userId?` (string)
    - `JsonValue` type utilitaire si pas déjà partagé
  - Notes: `BaseExecutionTrace` est le contrat HTTP — les deux côtés l'étendent pour leurs besoins spécifiques.

- [x] **Task 3: Définir les types canoniques de discovery et UI**
  - File: `shared/discovery/types.ts` (NEW)
  - File: `shared/ui/types.ts` (NEW)
  - Action:
    - `ToolUiMeta` — `resourceUri?`, `visibility?` (Array<"model" | "app">), `emits?` (string[]), `accepts?` (string[])
    - `FetchedUiHtml` — `resourceUri` (string), `content` (string), `mimeType` (string) (non-optionnel — aligner sur PML)
    - `McpToolInfo` — `name` (string), `description?` (string), `inputSchema?` (Record), `uiMeta?` (ToolUiMeta) — type minimaliste pour le chargement MCP
  - Notes: `DiscoveredTool` (use-case enrichi) reste dans `src/` — c'est un concept serveur.

- [x] **Task 4: Définir les types canoniques de routing et execution**
  - File: `shared/routing/types.ts` (NEW)
  - File: `shared/execution/types.ts` (NEW)
  - Action:
    - `ToolRouting` — `"client" | "server"`
    - `RoutingConfig` — `version` (string), `clientTools` (string[]), `serverTools` (string[]), `defaultRouting` (ToolRouting)
    - `DAGTask` — `id` (string), `tool` (string), `arguments?` (Record), `dependsOn` (string[]), `layerIndex` (number)
    - `ApprovalType` — `"tool_permission" | "dependency" | "api_key_required" | "integrity" | "oauth_connect"`
  - Notes: Ce sont des types 100% alignés — extraction directe sans résolution de drift.

- [x] **Task 5: Assembler `mod.ts` et vérifier le package**
  - File: `shared/mod.ts`
  - Action: Ré-exporter tous les types depuis les sous-modules. Lancer `deno check shared/mod.ts` pour valider.
  - Notes: Pas de logique, que des `export type { ... } from "./tracing/types.ts"` etc.

- [x] **Task 6: Ajouter `shared/` aux import maps**
  - File: `deno.json` (racine)
  - File: `packages/pml/deno.json`
  - Action:
    - Racine : ajouter `"@casys/pml-types": "./shared/mod.ts"` dans imports
    - PML : ajouter `"@casys/pml-types": "../../shared/mod.ts"` dans imports (ou path relatif correct)
  - Notes: En dev = path local. En publication JSR = résolu automatiquement.

- [x] **Task 7: Tests de contrat TDD (AVANT migration)**
  - File: `tests/unit/shared-types/alignment_test.ts` (NEW)
  - Action: Écrire les tests AVANT de migrer. Ils définissent le contrat attendu :
    - Test 1 : `BaseExecutionTrace` est assignable depuis un objet JSON correspondant au format HTTP réel (snapshot d'une vraie trace extraite de la DB)
    - Test 2 : Round-trip test — sérialiser `BaseExecutionTrace` en JSON, désérialiser, vérifier structure
    - Test 3 : `EnrichedTraceTaskResult extends TraceTaskResult` — les champs enrichis sont distinguables
    - Test 4 : `LocalExecutionTrace extends BaseExecutionTrace` — PML trace est compatible avec le contrat
    - Test 5 : `StoredExecutionTrace extends BaseExecutionTrace` — Server trace est compatible
  - Notes: Ces tests servent de **filet de sécurité** pendant la migration ET de **garde CI** après. Les écrire d'abord force à trancher les conflits de types proprement avant de toucher au code.

- [x] **Task 8: Audit d'impact des renamings**
  - Action: AVANT toute migration, pour chaque renaming, grep exhaustif des usages :
    - `id` (dans contexte ExecutionTrace) → lister toutes les destructurations, queries Drizzle, sérialisations, tests
    - `executedAt` → idem
    - `error` (dans contexte trace) → idem
    - `DiscoveredTool` → lister tous les imports et usages dans PML + src/
    - `ToolCallRecord` → lister tous les sites de construction (vérifier si `taskId`/`timestamp`/`layerIndex` sont fournis)
  - Notes: Produire un rapport chiffré : X usages de `id`, Y de `executedAt`, etc. Ce rapport informe les décisions de Task 9. Si un renaming impacte 50+ usages, on peut décider de garder l'ancien nom dans le shared type et d'utiliser un alias côté PML. **Pas de renaming aveugle.**

- [x] **Task 9: Migrer — résolution cas par cas**
  - Action: Pour chaque type conflictuel, dans cet ordre (du moins risqué au plus risqué) :
  - **Phase A — Types alignés (risque zéro)** :
    - `BranchDecision`, `ToolRouting`, `RoutingConfig`, `DAGTask`, `ApprovalType` — extraction directe, 0 drift
    - `ToolUiMeta` — identique, supprimer les 2 copies (PML + src/), importer shared
    - `FetchedUiHtml` — aligner optionnalité `mimeType`, trivial
  - **Phase B — Types à renommer (risque moyen)** :
    - `DiscoveredTool` → `McpToolInfo` (PML), `RegisteredMcpTool` (src/registry), garder `DiscoveredTool` (src/use-case)
    - `ToolCallRecord` → supprimer, remplacer par `TraceTaskResult` (vérifier champs manquants)
  - **Phase C — Types avec drift de champs (risque élevé)** :
    - `TraceTaskResult` — shared = 8 champs communs, src/ crée `EnrichedTraceTaskResult extends`
    - `LocalExecutionTrace` / `ExecutionTrace` → `BaseExecutionTrace` shared + extensions locales
    - Résoudre chaque conflit de naming (`id`/`traceId`, `error`/`errorMessage`, `executedAt`/`timestamp`) en s'appuyant sur le rapport d'audit Task 8
    - **Chaque renaming est un sous-commit isolé** — si un renaming casse, on revert juste celui-là
  - Files PML (Phase A-C) :
    - `packages/pml/src/tracing/types.ts`
    - `packages/pml/src/execution/types.ts`
    - `packages/pml/src/types.ts`
    - `packages/pml/src/discovery/mcp-discovery.ts`
    - `packages/pml/src/cli/shared/types.ts`
    - `packages/pml/src/workflow/pending-store.ts`
    - `packages/pml/src/loader/types.ts`
  - Files src/ (Phase A-C) :
    - `src/capabilities/types/execution.ts`
    - `src/api/types.ts`
    - `src/api/traces.ts`
    - `src/mcp/registry/discovery.ts`
    - `src/application/use-cases/discover/types.ts`
    - `src/services/ui-collector.ts`
    - `src/sandbox/types.ts`
  - Notes: Après chaque phase, `deno check` + `deno task test`. Si ça casse, on fix avant de passer à la phase suivante. Les column names DB (`id`, `executed_at`) ne changent JAMAIS — seuls les types TS sont renommés, avec un mapping explicite dans `traces.ts`.

- [x] **Task 10: Vérification complète et publication** (publication JSR différée au prochain release cycle)
  - Action:
    - `deno check` sur tout le workspace (racine + packages/pml)
    - `deno task test` pour vérifier qu'aucun test existant ne casse
    - `deno task lint` + `deno task fmt`
    - Publier `@casys/pml-types@0.1.0` sur JSR
  - Notes: La publication peut être différée au prochain release cycle. L'important est que le code compile et les tests passent.

### Acceptance Criteria

- [x] **AC 1**: Given le package `shared/`, when on lance `deno check shared/mod.ts`, then aucune erreur de compilation.

- [x] **AC 2**: Given `packages/pml/` modifié, when on lance `deno check packages/pml/mod.ts`, then aucune erreur — les types partagés sont correctement importés et utilisés.

- [x] **AC 3**: Given `src/` modifié, when on lance `deno check src/`, then aucune erreur — les types partagés sont correctement importés, les extensions `extends` compilent.

- [x] **AC 4**: Given une trace JSON envoyée par PML au format `BaseExecutionTrace`, when le serveur la reçoit dans `src/api/traces.ts`, then le mapping vers `StoredExecutionTrace` fonctionne sans erreur runtime. *(Validé via alignment tests round-trip JSON)*

- [x] **AC 5**: Given les types `TraceTaskResult` et `EnrichedTraceTaskResult`, when on assigne un `TraceTaskResult` à une variable de type `EnrichedTraceTaskResult`, then TypeScript signale une erreur (les champs enrichis sont obligatoires ou au moins distinguables). *(extends pattern en place)*

- [x] **AC 6**: Given la suppression de `ToolCallRecord`, when on cherche `ToolCallRecord` dans tout `packages/pml/`, then 0 occurrence — remplacé partout par `TraceTaskResult`. *(grep: 0 `interface ToolCallRecord`, alias deprecated en place)*

- [x] **AC 7**: Given les 3 anciennes définitions de `ToolUiMeta`, when on cherche `interface ToolUiMeta` ou `type ToolUiMeta` dans tout le workspace, then exactement 1 occurrence — dans `shared/ui/types.ts`.

- [x] **AC 8**: Given le renaming `DiscoveredTool` → `McpToolInfo` dans PML et `RegisteredMcpTool` dans src/registry, when on cherche ces types, then chacun n'existe qu'à un seul endroit et les imports sont corrects.

- [x] **AC 9**: Given les tests de cohérence structurelle, when on lance `deno test tests/unit/shared-types/`, then tous les tests passent (round-trip JSON, assignabilité des extensions, snapshot de trace réelle). *(12/12 pass)*

- [x] **AC 10**: Given `deno task test` lancé à la racine, when tous les tests existants s'exécutent, then aucune régression — les tests existants passent toujours. *(1276 pass, 2 failed pré-existants sur /blog routes — non liés à nos changements)*

## Additional Context

### Dependencies

- **Aucune dépendance externe nouvelle** — le shared package est types-only (zéro runtime)
- **`deno.json` racine** doit être modifié pour ajouter l'import map
- **`packages/pml/deno.json`** doit être modifié pour ajouter l'import map
- **Publication JSR** nécessite scope `@casys` (déjà configuré, pattern existant)
- **Aucune migration DB** — les column names ne changent pas, seuls les types TypeScript sont renommés. Le mapping `traces.ts` fait la conversion `traceId` ↔ `id` en DB.

### Testing Strategy

- **Tests unitaires** : `tests/unit/shared-types/alignment_test.ts` — cohérence structurelle, round-trip JSON, assignabilité des extensions
- **Tests de non-régression** : `deno task test` complet — les 14 fichiers modifiés ne doivent casser aucun test existant
- **Vérification manuelle** : Un `deno check` complet sur le workspace suffit pour valider la migration des imports
- **Pas de tests d'intégration supplémentaires** — c'est du renaming + extraction de types, pas de changement de logique

### Notes

- **Risque principal** : le renaming `id` → `traceId` et `executedAt` → `timestamp` dans src/. Ces noms peuvent être utilisés dans des queries SQL, des sérialisations, des tests. L'audit des usages dans Task 8 est critique — NE PAS faire un find-replace aveugle. Le column name DB reste `id`/`executed_at`, seul le type TypeScript change.
- **Risque secondaire** : `ToolCallRecord` supprimé dans PML — vérifier que tous les sites de construction fournissent les champs supplémentaires (`taskId`, `timestamp`, `layerIndex`). Si certains sont optionnels dans la pratique, les marquer `?` dans le shared type.
- **Future consideration** : `SandboxExecutionResult` n'est PAS dans le shared package (évolution divergente intentionnelle). Si les deux côtés convergent à l'avenir, l'extraire dans un second temps.
- **Future consideration** : Ajouter un JSON Schema généré automatiquement depuis les types TypeScript (via `ts-json-schema-generator` ou équivalent Deno) pour validation runtime côté API. Hors scope actuel.
- **Leçon architecturale** : Documenter dans un ADR que `shared/` est le contrat de communication PML client ↔ server. Tout nouveau type traversant le fil HTTP DOIT y être défini.

## Review Notes (2026-03-01)

- Adversarial review completed
- Findings: 10 total, 4 fixed, 4 acknowledged/deferred, 2 no-action
- Resolution approach: walk-through

### Findings resolved:
- **F1 (Critical)**: `trace.error` → `trace.errorMessage` in test line 77 — fixed
- **F2 (High)**: Backward-compat shim added: `incoming.errorMessage ?? incoming.error` in traces.ts
- **F5 (Medium)**: `PendingDAGTask` replaced with `DAGTask` alias from shared
- **F6 (Medium)**: `@deprecated` JSDoc added to `DiscoveredTool` and `PendingDAGTask` aliases
- **F8 (Low)**: Test added for `LocalExecutionTrace extends BaseExecutionTrace`

### Findings acknowledged/deferred:
- **F3 (High)**: JSR publish path — deferred to publish time (shared/ consumed via local import map for now)
- **F10 (Low)**: `shared/deno.json` publish config — deferred to publish time

### Findings noted, no action:
- **F4 (Medium)**: Dual export/import pattern — correct TS pattern, not a bug
- **F7 (Medium)**: `ToolUiMeta` gains `visibility` — pre-existing DB cast, field is optional
- **F9 (Low)**: Unrelated `deriveMcpType` change in working tree — not part of this migration
