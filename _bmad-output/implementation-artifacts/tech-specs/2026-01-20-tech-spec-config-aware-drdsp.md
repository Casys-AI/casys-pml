---
title: 'Config-Aware Path Selection in DRDSP'
slug: 'config-aware-drdsp'
created: '2026-01-20'
updated: '2026-01-21'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - Deno/TypeScript
  - SHGAT (scoring)
  - DRDSP (path selection)
  - DAGSuggester (facade)
  - PML Package
files_to_modify:
  - src/graphrag/algorithms/shgat/types.ts
  - src/graphrag/dag-suggester.ts
  - src/graphrag/algorithms/dr-dsp.ts
  - src/application/use-cases/capabilities/get-suggestion.ts
  - src/mcp/handlers/suggestion-handler.ts
  - packages/pml/src/workflow/pending-store.ts
  - packages/pml/src/loader/types.ts
code_patterns:
  - DAGSuggester facade pattern
  - HIL approval flow (tool_permission pattern)
  - McpDependency with command/args
  - ToolNode with configAvailability
test_patterns:
  - Unit tests for path filtering
  - Integration tests for HIL flow
---

# Tech-Spec: Config-Aware Path Selection in DRDSP

**Created:** 2026-01-20
**Updated:** 2026-01-21

## Overview

### Problem Statement

Les MCP servers peuvent avoir des configs différentes selon les users (ex: `--read-only`, `--context ide`). Ces configs affectent:
1. **Les tools exposés** - Certains tools peuvent être absents selon la config (ex: `serena:edit_file` absent en mode `--read-only`)
2. **Le comportement des tools** - Le même tool peut refuser certaines opérations selon la config (ex: `db:query` refuse les writes en `readonly: true`)

Actuellement, SHGAT apprend et DRDSP suggère des chemins sans tenir compte de ces variations de config, ce qui peut mener à des suggestions incompatibles avec la config du user.

### Solution

**Séparation des responsabilités:**

| SHGAT | DRDSP |
|-------|-------|
| Scoring sémantique pur | Contraintes runtime |
| Apprend sur les traces (tools abstraits) | Connaît les configs et tools disponibles |
| Généraliste, transférable | Spécifique au user/session |
| Utilise `embedding` + `toolFeatures` | Utilise `configAvailability` |

**Architecture graphe unifié:**
- **Un seul graphe** partagé entre SHGAT et DRDSP
- **Attributs différents** selon l'usage:
  - SHGAT: `embedding`, `toolFeatures` (pageRank, cooccurrence...)
  - DRDSP: `configAvailability` (quelles configs rendent ce tool disponible)

**Peuplement de configAvailability (user → cloud):**
```
User A (--read-only)           User B (--context ide)           Cloud
        │                              │                          │
        ▼                              ▼                          │
   spawn + list_tools            spawn + list_tools              │
        │                              │                          │
        ▼                              ▼                          │
   sync: {args, tools}           sync: {args, tools}             │
        │                              │                          │
        └──────────────────────────────┴──────────────────────────┘
                                       │
                                       ▼
                              Agrège les couples:
                              (args, tools_disponibles)
                                       │
                                       ▼
                              Construit configAvailability:
                              serena:edit_file → {
                                availableWith: [[--context, ide]],
                                notAvailableWith: [[--read-only]]
                              }
```

**Flow:**
1. `mcp-tools-auto-sync`: Spawn MCP → `list_tools` → sync tools + configs vers cloud
2. User intent → SHGAT score les capabilities (scoring sémantique pur)
3. DRDSP reçoit les scores + consulte `configAvailability` des tools
4. DRDSP filtre les chemins où tools non disponibles avec config user
5. Si meilleur chemin incompatible → HIL `config_permission`
6. User décide → si approuvé: restart MCP avec nouvelle config → retry

**Nouveau HIL type:** `config_permission` (séparé de `tool_permission` car actions post-approval différentes)

### Scope

**In Scope:**
- Extension de `ToolNode` avec `configAvailability`
- DRDSP: filtrage des chemins selon `configAvailability` + config user
- Nouveau HIL type: `config_permission`
- Sync des configs (args) via `mcp-tools-auto-sync`

**Out of Scope:**
- Modification de l'apprentissage SHGAT (reste pur scoring sémantique)
- Suggestion automatique de tools alternatifs
- Heuristique pour deviner les capabilities depuis les args
- Discovery des options de config MCP (non supporté par le protocole)

## Context for Development

### Architecture du Graphe Unifié

**ToolNode actuel (src/graphrag/algorithms/shgat/types.ts):**
```typescript
interface ToolNode {
  id: string;                      // "serena:edit_file"
  embedding: number[];             // Pour SHGAT (1024D)
  toolFeatures?: ToolGraphFeatures; // Pour SHGAT (pageRank, cooccurrence...)
}
```

**ToolNode étendu:**
```typescript
interface ToolNode {
  id: string;
  embedding: number[];
  toolFeatures?: ToolGraphFeatures;

  // NEW: Pour DRDSP - quelles configs rendent ce tool disponible
  configAvailability?: {
    // Configs où ce tool est disponible (résultat de list_tools)
    availableWith: string[][];    // [["--context", "desktop-app"], ["--context", "ide"]]
    // Configs où ce tool N'est PAS disponible
    notAvailableWith: string[][]; // [["--read-only"]]
  };
}
```

**Principe clé:** La source de vérité est `list_tools`, pas les args. On ne devine pas, on constate quels tools sont réellement exposés avec chaque config.

### Codebase Patterns

**1. DAGSuggester Facade (src/graphrag/dag-suggester.ts)**
- Orchestre SHGAT scoring + DRDSP path selection
- `suggestDAG(intent)` retourne un `SuggestedDAG`
- Point d'insertion: après scoring, filtrer selon `configAvailability`

**2. HIL Approval Pattern (packages/pml/src/workflow/pending-store.ts)**
- `ApprovalType = "tool_permission" | "dependency" | "api_key_required" | "integrity"`
- À étendre avec `"config_permission"`
- Actions post-approval différentes: `tool_permission` = install, `config_permission` = restart avec nouvelle config

**3. ToolNode Structure (src/graphrag/algorithms/shgat/types.ts)**
- Déjà a `id`, `embedding`, `toolFeatures`
- À étendre avec `configAvailability`

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `src/graphrag/algorithms/shgat/types.ts` | ToolNode à étendre avec configAvailability |
| `src/graphrag/algorithms/shgat/graph/graph-builder.ts` | GraphBuilder qui construit les noeuds |
| `src/graphrag/dag-suggester.ts` | Facade pour suggestions, intégrer filtrage |
| `src/graphrag/algorithms/dr-dsp.ts` | DRDSP algorithm |
| `packages/pml/src/workflow/pending-store.ts` | ApprovalType à étendre |
| `packages/pml/src/loader/stdio-manager.ts` | Restart MCP après approval |

### Technical Decisions

**TD-001: SHGAT reste pur**
- SHGAT n'a pas connaissance des configs
- Scoring basé uniquement sur `embedding` + `toolFeatures`
- Pas de config dans les traces
- L'apprentissage reste transférable entre users

**TD-002: DRDSP gère les contraintes**
- DRDSP consulte `configAvailability` sur les ToolNodes
- Compare avec la config du user (args syncés)
- Filtre les chemins incompatibles
- Déclenche HIL `config_permission` si meilleur chemin incompatible

**TD-003: Source de vérité = list_tools**
- PAS d'heuristique sur les args (`--read-only`, etc.)
- On sync les tools réellement exposés par chaque config
- `mcp-tools-auto-sync` doit spawner avec différentes configs et collecter les tools
- `configAvailability` est peuplé à partir de ces données

**TD-004: Nouveau HIL config_permission**
- Séparé de `tool_permission` car:
  - Sémantique différente: "autoriser un tool" vs "changer une config"
  - Action post-approval différente: install vs restart
  - Messages user différents
- Payload: `{ namespace, currentArgs, suggestedArgs, reason }`

**TD-005: Graphe unifié**
- Un seul graphe partagé entre SHGAT et DRDSP
- SHGAT utilise: `embedding`, `toolFeatures`
- DRDSP utilise: `configAvailability`
- Évite la duplication de noeuds

**TD-006: Cas d'usage**
- **Cas normal (futur):** PML gère les MCPs centralement, configs connues et validées
- **Edge case (actuel):** Users ajoutent MCPs via `.pml.json`, on fait au mieux avec `list_tools`
- **Config invalide:** On ne peut pas détecter (limitation protocole MCP), responsabilité du user

## Implementation Plan

### Tasks

#### Phase 1: Extension du modèle de données

- [ ] **Task 1: Étendre ToolNode avec configAvailability**
  - File: `src/graphrag/algorithms/shgat/types.ts`
  - Action: Ajouter à l'interface `ToolNode`:
  ```typescript
  configAvailability?: {
    availableWith: string[][];    // Configs où ce tool existe
    notAvailableWith: string[][]; // Configs où ce tool n'existe pas
  };
  ```

- [ ] **Task 2: Définir UserSessionConfig type**
  - File: `src/graphrag/types.ts`
  - Action: Ajouter type pour la config session du user
  ```typescript
  export interface UserSessionConfig {
    // Namespace -> args actuels
    serverConfigs: Record<string, string[]>;
    // Tools actuellement disponibles (from list_tools)
    availableTools: string[];
  }
  ```

- [ ] **Task 3: Ajouter config_permission à ApprovalType**
  - File: `packages/pml/src/workflow/pending-store.ts`
  - Action: Étendre `ApprovalType` avec `"config_permission"`
  - Action: Ajouter champs dans `PendingWorkflow`:
  ```typescript
  configChange?: {
    namespace: string;
    currentArgs: string[];
    suggestedArgs: string[];
    reason: string;
  };
  ```

#### Phase 2: Logique de filtrage DRDSP

- [ ] **Task 4: Créer ConfigCompatibilityChecker**
  - File: `src/graphrag/config-compatibility.ts` (nouveau)
  - Action: Créer module pour vérifier compatibilité tool/config
  ```typescript
  /**
   * Vérifie si un tool est disponible avec la config user actuelle.
   * Source de vérité: configAvailability du ToolNode (peuplé depuis list_tools)
   */
  export function isToolAvailable(
    toolNode: ToolNode,
    userConfig: UserSessionConfig
  ): { available: boolean; reason?: string }

  /**
   * Trouve quelle config rendrait un tool disponible.
   */
  export function findCompatibleConfig(
    toolNode: ToolNode,
    currentArgs: string[]
  ): { suggestedArgs: string[]; reason: string } | null
  ```
  - Notes: PAS d'heuristique, se base uniquement sur `configAvailability`

- [ ] **Task 5: Intégrer filtrage dans DAGSuggester**
  - File: `src/graphrag/dag-suggester.ts`
  - Action: Dans `suggestDAG()`, après `rankCandidates()`:
    1. Si `userSessionConfig` fourni, vérifier `configAvailability` de chaque tool
    2. Filtrer les chemins avec tools non disponibles
    3. Si meilleur chemin filtré, calculer quelle config le rendrait dispo
  - Action: Ajouter setter `setUserSessionConfig(config: UserSessionConfig)`

- [ ] **Task 6: Étendre SuggestedDAG avec configIncompatibility**
  - File: `src/graphrag/types/dag.ts`
  - Action: Ajouter à `SuggestedDAG`:
  ```typescript
  configIncompatibility?: {
    toolId: string;
    namespace: string;
    currentArgs: string[];
    suggestedArgs: string[];
    reason: string;
  };
  ```

#### Phase 3: Peuplement de configAvailability

- [ ] **Task 7: Étendre mcp-tools-auto-sync pour syncer les args**
  - File: À définir dans tech-spec `mcp-tools-auto-sync`
  - Action: Lors du sync user:
    1. Syncer les tools disponibles (déjà fait)
    2. Syncer les args de config du user (à ajouter)
  - Notes: On spawn UNIQUEMENT avec la config du user, pas plusieurs configs

- [ ] **Task 8: Agrégation cloud de configAvailability**
  - File: `src/server/services/config-availability-aggregator.ts` (nouveau)
  - Action: Côté cloud, agréger les données de plusieurs users:
    1. Collecter les couples (args, tools_disponibles) de chaque user
    2. Construire le mapping tool → configs où il est dispo
    3. Pour les MCPs connus (Serena, etc.), pré-peupler avec configs documentées
  - Notes: C'est le cloud qui construit `configAvailability`, pas le user

- [ ] **Task 9: Endpoint pour récupérer configAvailability**
  - File: `src/server/routes/api/v1/tools.ts`
  - Action: Endpoint qui retourne les tools avec leur `configAvailability`
  - Notes: Utilisé par DRDSP pour construire le graphe

#### Phase 4: Client PML - HIL config_permission

- [ ] **Task 10: Formatter pour config_permission**
  - File: `packages/pml/src/cli/shared/approval-formatter.ts`
  - Action: Ajouter formatage pour `config_permission`:
  ```
  ⚙️ Config Change Required

  The suggested workflow needs different MCP configuration:

  Server: serena
  Current: --context ide --read-only
  Suggested: --context desktop-app
  Reason: Workflow requires serena:edit_file (not available in read-only mode)

  [y] Approve config change
  [n] Cancel
  ```

- [ ] **Task 11: Handler pour config_permission approval**
  - File: `packages/pml/src/cli/stdio-command.ts`
  - Action: Quand `config_permission` approuvé:
    1. Update la config MCP locale (.pml.json ou .mcp.json)
    2. Graceful shutdown du MCP server concerné
    3. Restart avec nouvelle config
    4. Re-trigger la suggestion/execution
  - Notes: Attention au restart - peut interrompre des opérations en cours

### Acceptance Criteria

- [ ] **AC1:** Given un user avec serena en `--read-only`, when DRDSP suggère un chemin avec `serena:edit_file`, then le chemin est filtré car `configAvailability.notAvailableWith` contient `["--read-only"]`

- [ ] **AC2:** Given un chemin incompatible avec la config, when c'est le meilleur chemin, then un HIL `config_permission` est retourné avec les détails (namespace, currentArgs, suggestedArgs calculés depuis `configAvailability`)

- [ ] **AC3:** Given un HIL `config_permission` approuvé, when le client traite l'approval, then la config MCP est mise à jour, le server redémarré, et la suggestion re-exécutée

- [ ] **AC4:** Given aucune `userSessionConfig` fournie dans la requête, when DRDSP suggère, then le comportement est inchangé (backward compatible)

- [ ] **AC5:** Given plusieurs chemins possibles, when le meilleur est incompatible mais le 2ème est compatible, then le 2ème est retourné sans HIL

- [ ] **AC6:** Given un ToolNode sans `configAvailability`, when DRDSP filtre, then le tool est considéré comme toujours disponible (backward compatible)

## Additional Context

### Dependencies

**Hard Dependencies:**
- Tech-spec `mcp-tools-auto-sync` doit être étendue pour:
  1. Syncer les configs (args) du user en plus des tools
  2. Le user spawn UNIQUEMENT avec sa config (pas plusieurs configs)

**Cloud-side:**
- Agrégation des couples (args, tools_disponibles) de plusieurs users
- Pré-peuplement de `configAvailability` pour MCPs connus (Serena, etc.)
- Endpoint pour récupérer les ToolNodes avec `configAvailability`

### Limitations Connues

1. **MCP Protocol ne supporte pas config discovery** - On ne peut pas demander à un MCP "quelles sont tes options de config?". On doit spawner et observer.

2. **Config invalide non détectable** - Si un user met une config invalide, le MCP crashe ou ignore silencieusement. On ne peut pas valider avant.

3. **Restart MCP risqué** - Peut interrompre des opérations en cours. Graceful shutdown recommandé.

4. **Edge case users custom** - Pour les MCPs ajoutés par les users (pas gérés par PML), on fait au mieux avec les tools réellement exposés.

### Testing Strategy

**Unit Tests:**
- `config-compatibility.ts`: Test `isToolAvailable()` avec différentes combinaisons ToolNode/UserSessionConfig
- `config-compatibility.ts`: Test `findCompatibleConfig()`
- `dag-suggester.ts`: Test filtrage avec mock ToolNodes ayant `configAvailability`

**Integration Tests:**
- Flow complet: requête avec userSessionConfig → filtrage → réponse
- HIL flow: config_permission déclenché → approval → config updated → retry

**Manual Tests:**
1. Configurer serena en read-only
2. Demander un workflow qui nécessite edit
3. Vérifier que HIL config_permission est déclenché
4. Approuver et vérifier que serena est redémarré avec nouvelle config

### Notes

- Le même graphe est utilisé par SHGAT (embedding, toolFeatures) et DRDSP (configAvailability)
- SHGAT apprend sur des tools "abstraits" (sans config), DRDSP résout vers les configs concrètes
- Les args sont informatifs pour le message HIL, pas pour le filtrage (source de vérité = list_tools)
- À terme, PML gèrera les MCPs centralement et les configs seront connues et validées
