# Tech Spec: Execution Trace Data Quality — task_results comme source unique

**Date** : 2026-02-24
**Contexte** : Audit SHGAT enrichment a révélé que le GRU training ne voit ni les capabilities ni le contenu des boucles dans les séquences d'exécution.
**Suite de** : `2026-02-24-shgat-audit-findings.md`

---

## 1. Résumé

`task_results` (jsonb) est la source de vérité pour les traces d'exécution. `executed_path` (text[]) est un legacy redondant — tout ce qu'il contient est dérivable de `task_results`.

Trois problèmes dans `task_results` empêchent le GRU de voir l'image complète :

| # | Problème | Impact |
|---|----------|--------|
| 1 | `buildTaskResults()` ne capture que `tool_end`, pas `capability_end` | Caps absentes des séquences de training |
| 2 | Loop Path B stocke `[{tool: "loop:forOf"}]` sans itérations ni `bodyTools` | Le GRU ne sait pas ce qu'il y a dans les boucles |
| 3 | `getCleanToolPath()` filtre les `loop:*` sans expander `bodyTools` | Info perdue même quand bodyTools existe |

---

## 2. Données actuelles

### 2.1 `task_results` vs `executed_path` vs `dag_structure.tools_used`

| Champ | Format | Source | Boucles | Caps |
|-------|--------|--------|---------|------|
| `dag_structure.tools_used` | jsonb array de strings | Analyse statique du code (AST) | Déplie les tools internes | N/A (c'est le champ de la cap) |
| `task_results` | jsonb array d'objets | Exécution runtime (traces `tool_end`) | Opaque : `loop:forOf` sans intérieur | Absentes (filtre `tool_end` only) |
| `executed_path` | text[] | Exécution runtime (`buildExecutedPath`) | Déplie via bodyTools (dédupliqué) | UUIDs (pas FQDN) → filtrées |

### 2.2 Pourquoi `executed_path` est redondant

`getCleanToolPath()` (`src/capabilities/trace-path.ts:28`) utilise déjà `task_results` en priorité. `executed_path` est le fallback quand `task_results` est vide (traces legacy). Avec les fixes ci-dessous, `task_results` sera complet → `executed_path` inutile.

### 2.3 Deux code paths pour les loops

| Aspect | Path A (trace parente) | Path B (trace du loop) |
|--------|----------------------|----------------------|
| Déclenché par | `worker-bridge.ts:405-451` (exécution normale) | `worker-bridge.ts:624-687` (loop-specific) |
| `task_results` | `buildTaskResults(sortedTraces)` → itérations individuelles ✓ | `[loopTaskResult]` → 1 entry opaque ✗ |
| `bodyTools` | Propagé depuis trace event (line 1079) mais null en pratique car `loopMetadata.bodyTools` arrive vide upstream | Sur loopTaskResult mais null en DB |
| `executed_path` | `buildExecutedPath(sortedTraces)` → toutes les traces | `[toolName, ...bodyTools]` → dédupliqué |

### 2.4 Statistiques en DB (2026-02-24)

- 2182 traces totales avec `task_results` non vide
- 32 traces avec `loop:*` dans `task_results` (1.5%)
- 0/32 ont `body_tools` rempli (toujours null)
- 0 `capability_end` events dans task_results (caps absentes)

---

## 3. Deux vues nécessaires pour les loops

Pour le GRU training et le SHGAT graph :

- **Vue complète** : toutes les itérations individuelles (entries séparées dans task_results)
  - Utile pour : compter les itérations, voir les args/résultats différents
  - Exemple : `[get_file_info(/a), get_file_info(/b), get_file_info(/c)]`

- **Vue dédupliquée** : `bodyTools` sur l'entry loop (liste unique depuis l'analyse statique)
  - Utile pour : SHGAT graph (quels tools le loop utilise), GRU training (séquence dédupliquée)
  - Exemple : `["filesystem:get_file_info"]`

---

## 4. Fixes proposés

### Fix 1 : `buildTaskResults()` — inclure capability_end + propager loop metadata

**Fichier** : `src/sandbox/worker-bridge.ts:1061-1082`

Actuellement : `.filter((t): t is ToolTraceEvent => t.type === "tool_end")` — ne capture que les tools.

**Changements** :
- Changer le filtre à `.filter(isEndTraceEvent)` (capture `tool_end` ET `capability_end`)
- Dans le `.map()`, gérer les deux types :
  - `tool_end` : garder logique existante + **propager** `bodyTools`, `loopId`, `loopType`, `loopCondition` depuis les propriétés du trace event
  - `capability_end` : créer `TraceTaskResult` avec `tool: capabilityFqdn ?? capability`, `isCapabilityCall: true`

**Prérequis** pour le FQDN des caps dans les traces :
- `src/sandbox/types.ts` : ajouter `capabilityFqdn?: string` à `CapabilityTraceEvent`
- `src/capabilities/code-generator.ts` : dans `generateInlineCode()`, émettre `capabilityFqdn` dans les deux appels `__trace()` (capability_start et capability_end). L'objet `Capability` passé a déjà `fqdn?: string`

### Fix 2 : Loop Path B — stocker trace complète + bodyTools

**Fichier** : `src/sandbox/worker-bridge.ts:687`

Actuellement :
```typescript
taskResults: [loopTaskResult],
```

Après :
```typescript
taskResults: [loopTaskResult, ...this.buildTaskResults(this.getSortedTraces())],
```

Résultat pour un loop qui fait 3x `get_file_info` :
```json
[
  {"tool": "loop:forOf", "body_tools": ["filesystem:get_file_info"], "loop_type": "forOf", ...},
  {"tool": "filesystem:get_file_info", "args": {"path": "/folder1"}, "duration_ms": 50, ...},
  {"tool": "filesystem:get_file_info", "args": {"path": "/folder2"}, "duration_ms": 45, ...},
  {"tool": "filesystem:get_file_info", "args": {"path": "/folder3"}, "duration_ms": 48, ...}
]
```

Entry 0 = vue dédupliquée (bodyTools). Entries 1-3 = trace complète.

### Fix 3 : `getCleanToolPath()` — expander bodyTools pour le training

**Fichier** : `src/capabilities/trace-path.ts:28-53`

```typescript
import { isLoopOperation } from "./pure-operations.ts";

// Dans la boucle sur taskResults :
if (isLoopOperation(toolId)) {
  if (tr.bodyTools && tr.bodyTools.length > 0) {
    raw.push(...tr.bodyTools);  // liste dédupliquée (statique)
  }
  continue; // skip le loop:* entry
}
```

Pour le GRU training, on veut la vue **dédupliquée** (quels tools le loop utilise, pas combien de fois).

---

## 5. Fichiers critiques

| Fichier | Modification |
|---------|-------------|
| `src/sandbox/types.ts` | Ajouter `capabilityFqdn?: string` à `CapabilityTraceEvent` |
| `src/capabilities/code-generator.ts` | Émettre `capabilityFqdn` dans `__trace()` |
| `src/sandbox/worker-bridge.ts` | `buildTaskResults()` (caps + loop metadata) + Path B (trace complète) |
| `src/capabilities/trace-path.ts` | `getCleanToolPath()` loop bodyTools expansion |
| `src/capabilities/pure-operations.ts` | Référence `isLoopOperation()` (pas de modif) |

---

## 6. Non-scope

- **`executed_path`** : pas touché. Legacy, sera deprecated à terme. `getCleanToolPath()` utilise déjà `task_results` en priorité.
- **`buildExecutedPath()`** : pas touché.
- **Backfill des traces existantes** : pas dans ce scope. Les nouvelles traces seront correctes.

---

## 7. Vérification

1. Exécuter une cap qui appelle un sous-cap → `task_results` contient le FQDN de la sous-cap
2. Exécuter un loop → `task_results` a : (a) entry `loop:forOf` avec `body_tools` rempli, (b) entries individuelles par itération
3. `getCleanToolPath()` sur une trace avec loop → retourne les tools dédupliqués depuis bodyTools
4. Tests unitaires : `deno test tests/unit/capabilities/`

---

## 8. Relation avec l'audit SHGAT

Cette tech-spec est issue de l'audit SHGAT (2026-02-24). Les findings SHGAT séparés sont dans `2026-02-24-shgat-audit-findings.md` :
- F1 : Deux pipelines GRU divergents (V2V absent du script standalone)
- F2 : L2 caps ignorées dans le graph SHGAT (filtre `toolVocab.has()` trop restrictif)
- F4 : Deux chemins d'enrichissement SHGAT divergents (prod V2V+MP vs script MP seul)

La présente spec adresse la source de données pour le training (task_results). Une fois ces fixes appliqués, le GRU training via `getCleanToolPath()` verra les tools internes aux boucles et les caps appelées.
