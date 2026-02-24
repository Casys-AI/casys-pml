# ADR-069: task_results comme source unique — dépréciation de executed_path

**Status:** Accepted
**Date:** 2026-02-24
**Deciders:** Architecture Team
**Related:** ADR-068 (FQDN Canonical Format), ADR-065 (Deferred Trace Flush), ADR-041 (Hierarchical Trace Tracking)

## Context

### Deux colonnes pour la même information

La table `execution_trace` stocke le résultat d'une exécution dans **deux colonnes redondantes** :

| Colonne | Type | Contenu | Source |
|---------|------|---------|--------|
| `task_results` | `jsonb` | Array d'objets structurés (tool, args, result, durationMs, success, layerIndex, loop metadata...) | `buildTaskResults()` dans `worker-bridge.ts` |
| `executed_path` | `text[]` | Array plat de tool IDs / capability UUIDs | `buildExecutedPath()` dans `worker-bridge.ts` |

Les deux sont construites depuis les mêmes traces runtime (`this.traces`), mais avec des filtres et formats différents.

### Problèmes de executed_path

1. **Capabilities en UUID** : `buildExecutedPath()` utilise `capabilityId` (UUID) pour les `capability_end` events, pas le FQDN. Ces UUIDs sont ensuite filtrés par `getCleanToolPath()` → les caps disparaissent de la séquence.
2. **Corruption historique** : 18.4% des entries contiennent des UUIDs bruts, 6.1% des FQDN non normalisés (audit 2026-02-18).
3. **Format pauvre** : `text[]` = juste des noms. Pas d'args, pas de durée, pas de success/failure, pas de metadata loop.

### Problèmes de task_results (avant fix)

1. **Caps invisibles** : `buildTaskResults()` ne capturait que `tool_end`, pas `capability_end` → caps absentes.
2. **Loops opaques** : Loop Path B stockait `[{tool: "loop:forOf"}]` sans itérations ni `bodyTools`.
3. **bodyTools null** : Le champ existait dans le type mais arrivait vide en pratique.

### Le consumer principal : getCleanToolPath()

`getCleanToolPath()` (`src/capabilities/trace-path.ts`) est le point d'extraction unique pour le GRU training et le scoring. Il utilise déjà `task_results` en priorité, avec fallback sur `executed_path` quand `task_results` est vide (traces legacy).

## Decision

### task_results est la source unique de vérité pour les traces d'exécution

1. **task_results promu** : Toute l'information d'exécution (tools, capabilities, loops, itérations) doit être dans `task_results`.
2. **executed_path déprécié** : Ne plus utiliser `executed_path` pour le training, le scoring, ou l'analytics. Conserver en écriture temporairement pour backward compatibility.
3. **getCleanToolPath() = seul reader** : Tout consumer de séquences d'exécution passe par `getCleanToolPath()`, qui lit `task_results` en priorité.

### Fixes appliqués (2026-02-24)

| Fix | Fichier | Changement |
|-----|---------|------------|
| `buildTaskResults()` élargi | `worker-bridge.ts:1061` | Filtre `isEndTraceEvent` (tool_end + capability_end). Caps → `tool: capabilityFqdn ?? capability`, `isCapabilityCall: true` |
| Loop Path B complété | `worker-bridge.ts:687` | `[loopTaskResult, ...this.buildTaskResults(this.getSortedTraces())]` — entry loop dédupliquée + itérations individuelles |
| `getCleanToolPath()` expand loops | `trace-path.ts:36` | Détecte `loop:*` entries, expand `bodyTools` au lieu de filtrer silencieusement |

### Prérequis déployés

| Fichier | Changement |
|---------|------------|
| `src/sandbox/types.ts` | `capabilityFqdn?: string` ajouté à `CapabilityTraceEvent` |
| `src/capabilities/code-generator.ts` | `capabilityFqdn` émis dans `__trace()` (start + end) quand `capability.fqdn` existe |

### Plan de dépréciation de executed_path

| Phase | Action | Timing |
|-------|--------|--------|
| 1 (fait) | `task_results` complété avec caps + loops | 2026-02-24 |
| 2 | Ajouter `@deprecated` sur `buildExecutedPath()` et le champ `executedPath` du type | Prochain sprint |
| 3 | Supprimer le fallback `executed_path` dans `getCleanToolPath()` quand 100% des traces actives ont `task_results` | Quand traces legacy < 1% |
| 4 | Supprimer la colonne `executed_path` de `execution_trace` | Migration DB finale |

## Consequences

### Positives

- **Source unique** : Plus de divergence entre deux colonnes qui racontent la même histoire différemment.
- **Caps visibles** : Le GRU training voit les capabilities (FQDN) dans les séquences, pas des UUIDs filtrés.
- **Loops exploitables** : `task_results` contient à la fois la vue dédupliquée (`bodyTools` sur l'entry loop) et la vue complète (itérations individuelles).
- **Données riches** : `task_results` conserve args, result, durationMs, success — utilisable pour du training avancé (pas juste les séquences).
- **0% corruption** : `task_results` n'a jamais eu le problème d'UUIDs bruts de `executed_path`.

### Négatives

- **Traces legacy** : Les ~2182 traces existantes avec `task_results` pré-fix restent avec des caps manquantes et des loops opaques. Pas de backfill prévu (les nouvelles traces seront correctes).
- **Taille jsonb** : `task_results` est plus lourd que `text[]`. Impact négligeable (quelques KB par trace).
- **Phase de transition** : `executed_path` reste en écriture pendant la phase 2-3 pour ne pas casser les éventuels consumers legacy.

### Risques

- **Consumers cachés de executed_path** : Si du code lit directement `executed_path` sans passer par `getCleanToolPath()`, il continuera de fonctionner mais avec des données legacy. Mitigation : grep du codebase avant phase 4.

## Notes

- Voir tech-spec détaillée : `_bmad-output/implementation-artifacts/tech-specs/2026-02-24-execution-trace-data-quality.md`
- Voir audit SHGAT : `_bmad-output/implementation-artifacts/tech-specs/2026-02-24-shgat-audit-findings.md`
- `executed_path` schema : `text[]` (PAS jsonb), PK=`id` (uuid), `executed_at` (PAS created_at)
