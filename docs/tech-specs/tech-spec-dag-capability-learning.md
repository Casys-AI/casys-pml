# Tech Spec: DAG, Capabilities & Learning Architecture

**Status:** 📋 DRAFT - Discussion
**Date:** 2025-12-16
**Authors:** Discussion Claude + User
**Related:** `bug-parallel-execution-tracking.md`, ADR-041, ADR-043

---

## Executive Summary

Cette tech spec adresse plusieurs questions architecturales interconnectées autour de l'apprentissage depuis les DAGs et le code, la création de capabilities, et la cohérence du modèle de données.

### Problèmes identifiés

1. **Parallel tracking** : Les tools exécutés en parallèle ne créent pas d'edges
2. **DAG → Capability** : Un DAG exécuté avec succès ne génère pas de capability
3. **Edge types confus** : `sequence` vs `dependency` - quelle différence ?
4. **Co-occurrence manquant** : Pas d'edge type pour "utilisés ensemble"
5. **Code vs DAG** : Tension entre les deux modèles d'exécution
6. **Mode definition vs invocation** : Pas de distinction dans le data model

---

## 1. Contexte : Deux modèles d'exécution

### 1.1 Le modèle DAG (`pml_execute_dag`)

```typescript
interface Task {
  id: string;
  tool: string;
  arguments: Record<string, unknown>;
  dependsOn: string[];  // Structure explicite
  type?: "mcp_tool" | "code_execution" | "capability";
  sideEffects?: boolean;  // Pour HIL
}
```

**Avantages :**
- Structure explicite (parallélisme, dépendances)
- DAG Suggester peut proposer des workflows
- Speculation possible (prédire next task)
- HIL granulaire par task
- Layers calculables pour exécution optimisée

**Inconvénients :**
- Moins naturel pour l'IA à générer
- Verbeux pour des workflows simples

### 1.2 Le modèle Code (`pml_execute_code`)

```typescript
// L'IA écrit du code naturel
const config = await mcp.fs.read({ path: "config.json" });
const [a, b] = await Promise.all([
  mcp.api.fetch({ url: config.urlA }),
  mcp.api.fetch({ url: config.urlB }),
]);
```

**Avantages :**
- Naturel pour l'IA
- Flexible (loops, conditions, etc.)
- Plus expressif

**Inconvénients :**
- Structure d'orchestration opaque
- DAG Suggester ne peut pas suggérer du code
- Speculation difficile
- HIL moins granulaire

### 1.3 Question fondamentale

> Comment réconcilier ces deux modèles pour que l'apprentissage fonctionne dans les deux cas ?

---

## 2. Parallel Execution Tracking

### 2.1 État actuel (BUG)

**Problème 1 : DAG parallel tasks**
```typescript
// Dans graph-engine.ts:updateFromExecution()
for (const task of execution.dagStructure.tasks) {
  for (const depTaskId of task.dependsOn) {  // ← Vide si parallel
    // Crée edge dependency
  }
}
// Si dependsOn: [] → AUCUN edge créé !
```

**Problème 2 : Code execution traces**
```typescript
// Dans execution-learning.ts - Phase 3
for (let i = 0; i < children.length - 1; i++) {
  createEdge(children[i], children[i + 1], "sequence");
  // ← Basé sur l'ordre dans l'array, pas les timestamps !
}
```

### 2.2 Solution proposée

**On a déjà les timestamps !** Dans `worker-bridge.ts` :
```typescript
{
  type: "tool_start",
  tool: toolId,
  ts: Date.now(),           // ← START TIME
  durationMs: durationMs,   // ← DURATION
}
```

**Algorithme de détection :**
```typescript
function detectParallelism(traces: TraceEvent[]): EdgeType {
  // Calculer endTs = ts + durationMs pour chaque trace
  // Si overlap (startA < endB && startB < endA) → "co-occurrence"
  // Sinon si A finit avant B commence → "sequence"
}
```

### 2.3 Nouveau edge type : `co-occurrence`

```typescript
export type EdgeType =
  | "dependency"      // A doit finir avant B (DAG explicit)
  | "contains"        // A contient B (hierarchy)
  | "sequence"        // A observé avant B (temporal)
  | "co-occurrence"   // A et B utilisés ensemble (parallel)
  | "alternative";    // A ou B pour même intent

export const EDGE_TYPE_WEIGHTS: Record<EdgeType, number> = {
  dependency: 1.0,
  contains: 0.8,
  alternative: 0.6,
  sequence: 0.5,
  "co-occurrence": 0.4,  // NOUVEAU
};
```

### 2.4 Questions ouvertes

- [ ] `co-occurrence` devrait-il être bidirectionnel (A↔B) ou deux edges (A→B, B→A) ?
- [ ] Weight de 0.4 est-il approprié ?
- [ ] Faut-il un seuil de chevauchement minimum (ex: 50% overlap) ?

---

## 3. Sequence vs Dependency : Clarification

### 3.1 Définitions actuelles

| Edge Type | Source | Sémantique |
|-----------|--------|------------|
| `dependency` | DAG `dependsOn` | A **doit** finir avant B (causalité) |
| `sequence` | Traces code | A **a été observé** avant B (corrélation) |

### 3.2 Le problème

Dans les deux cas, on a "A avant B". La différence est subtile :
- `dependency` = intention explicite du développeur/IA
- `sequence` = observation empirique

### 3.3 Options

**Option A : Garder les deux**
- `dependency` = forte confiance (explicit)
- `sequence` = faible confiance (inferred)
- La différence est capturée par `edge_source` (template vs observed)

**Option B : Fusionner en un seul type**
- Utiliser uniquement `edge_source` pour la confiance
- Simplifier le modèle

**Option C : Renommer pour clarifier**
- `dependency` → `explicit_dependency`
- `sequence` → `observed_sequence`

### 3.4 Recommandation

**Option A** - Garder les deux car la sémantique EST différente :
- `dependency` implique une **nécessité** (output de A utilisé par B)
- `sequence` implique juste un **pattern temporel** observé

---

## 4. DAG → Capability : Faut-il créer une capability ?

### 4.1 État actuel

- `execute_code` avec succès → Peut créer une capability (eager learning)
- `execute_dag` avec succès → Crée des edges, **mais pas de capability**

### 4.2 Question

> Un DAG réussi devrait-il devenir une capability réutilisable ?

### 4.3 Options

**Option A : Oui - Le DAG devient une capability**

```typescript
interface Capability {
  id: string;
  intent: string;

  // Deux formes possibles
  code?: string;           // Pour code_execution
  dagStructure?: DAGStructure;  // NOUVEAU - Pour DAG

  sourceType: "code" | "dag";
  toolsUsed: string[];
}
```

**Avantages :**
- Uniformise le modèle
- Un DAG réussi peut être re-suggéré comme capability
- Permet de "promouvoir" un DAG en capability

**Inconvénients :**
- Deux formats de capability à gérer
- Complexifie le matcher

**Option B : Non - DAG et Capability restent séparés**

Le DAG enrichit le graphe (edges), mais ne crée pas de capability.
Les capabilities sont réservées au code.

**Avantages :**
- Modèle simple
- Séparation claire des responsabilités

**Inconvénients :**
- On perd la possibilité de "rejouer" un DAG appris

**Option C : Hybride - DAG peut être "compilé" en capability code**

Quand un DAG réussit, on génère le code équivalent :
```typescript
// DAG original
{ tasks: [
  { id: "t1", tool: "fs:read", args: {...}, dependsOn: [] },
  { id: "t2", tool: "json:parse", args: {...}, dependsOn: ["t1"] }
]}

// Capability générée (code)
const t1 = await mcp.fs.read({...});
const t2 = await mcp.json.parse({...});
return t2;
```

### 4.4 Recommandation

**Option A** semble la plus cohérente. Une capability peut avoir deux formes d'implémentation (`code` ou `dag`), mais représente toujours "une procédure apprise pour un intent".

---

## 5. DAG Suggester & Speculation en mode Code-First

### 5.1 Le problème

Si l'IA utilise principalement `execute_code`, le DAG Suggester devient moins utile :
- Il ne peut pas suggérer du code (trop variable)
- Les capabilities code ne sont pas structurées comme des DAGs

### 5.2 Solutions possibles

**Solution A : DAG Suggester suggère des capabilities**

Au lieu de construire un DAG depuis le graphe, le suggester :
1. Cherche des capabilities qui matchent l'intent
2. Retourne la capability avec son code/DAG
3. L'IA peut l'exécuter via `execute_capability`

```typescript
// Nouveau flow
suggestCapability(intent: string): SuggestedCapability {
  // 1. Semantic search sur capabilities
  // 2. Graph-based ranking
  // 3. Retourne la meilleure capability
}
```

**Solution B : Garder les deux en parallèle**

- `suggestDAG()` - Pour quand l'IA veut un workflow structuré
- `suggestCapability()` - Pour quand l'IA veut du code

L'IA choisit selon le contexte.

**Solution C : Unifier via le tool `pml_find_capabilities`**

Le tool existant `pml_find_capabilities` retourne déjà des capabilities.
On pourrait l'enrichir pour inclure :
- Le code de la capability
- Ou le DAG équivalent

### 5.3 Speculation

La speculation actuelle prédit le "next tool" basé sur le workflow en cours.

En mode code, on pourrait :
1. **Spéculer sur les capabilities** - "Après cette capability, l'utilisateur voudra probablement X"
2. **Spéculer sur les tools** - Même logique, basé sur les traces

La speculation peut fonctionner si on trace correctement les `co-occurrence` et `sequence`.

---

## 6. HIL (Human-in-the-Loop) en mode Code

### 6.1 État actuel

Dans un DAG, chaque Task peut avoir `sideEffects: true` → trigger HIL approval.

### 6.2 En mode code

Options :
1. **Permission sets** - Déjà implémenté (`minimal`, `standard`, `privileged`)
2. **Analyse statique** - Détecter les tools à side effects avant exécution
3. **Runtime hooks** - Intercepter les appels dangereux

### 6.3 Recommandation

Utiliser les **permission sets** existants + enrichir avec une liste de tools "dangereux" qui trigger HIL même en mode code.

---

## 7. Mode Definition vs Invocation (Fresh UI)

### 7.1 Contexte

Dans Fresh, on veut pouvoir afficher :
- **Mode Definition** : La structure abstraite du workflow (template)
- **Mode Invocation** : L'exécution réelle avec résultats

### 7.2 État actuel

Pas de distinction dans le data model. Un DAG/Capability est stocké une fois.

### 7.3 Proposition

```typescript
interface Capability {
  // ... existing fields

  // Definition (template)
  definition: {
    code?: string;
    dagStructure?: DAGStructure;
    parametersSchema?: JSONSchema;  // Quels args le capability attend
  };

  // Invocations (historique)
  invocations?: CapabilityInvocation[];  // Ou dans une table séparée
}

interface CapabilityInvocation {
  id: string;
  capabilityId: string;
  timestamp: Date;
  arguments: Record<string, unknown>;  // Args utilisés
  results: TaskResult[];               // Résultats
  success: boolean;
  durationMs: number;
}
```

### 7.4 Questions

- [ ] Stocker les invocations dans la même table ou séparée ?
- [ ] Combien d'invocations garder ? (limite de rétention)
- [ ] L'UI Fresh a-t-elle besoin de plus de détails ?

---

## 8. Plan d'implémentation

### Phase 1 : Parallel Tracking (Quick Win)

1. Modifier `execution-learning.ts` pour utiliser les timestamps
2. Ajouter edge type `co-occurrence`
3. Modifier `graph-engine.ts:updateFromExecution()` pour créer des edges même sans `dependsOn`

**Effort estimé :** 1-2 jours

### Phase 2 : DAG → Capability

1. Ajouter `dagStructure` optionnel dans `Capability`
2. Créer une capability après un DAG réussi (opt-in ou auto ?)
3. Adapter le matcher pour supporter les deux formats

**Effort estimé :** 2-3 jours

### Phase 3 : Suggester Unification

1. Enrichir `pml_find_capabilities` pour retourner code/DAG
2. Adapter DAG Suggester pour suggérer des capabilities
3. Tester la speculation avec le nouveau modèle

**Effort estimé :** 3-5 jours

### Phase 4 : Definition vs Invocation

1. Ajouter table `capability_invocations`
2. Logger chaque exécution de capability
3. Adapter l'API et Fresh UI

**Effort estimé :** 2-3 jours

---

## 9. Questions ouvertes (À discuter)

### Fondamentales

1. **Option A vs B vs C pour DAG → Capability ?**
2. **Fusionner sequence/dependency ou garder les deux ?**
3. **Co-occurrence bidirectionnel ou directionnel ?**

### UX/Comportement

4. **Créer une capability automatiquement après DAG réussi ou opt-in ?**
5. **Seuil de confiance pour suggestion capability vs DAG ?**
6. **Comment l'IA choisit entre code et DAG ?**

### Technique

7. **Rétention des invocations (combien garder) ?**
8. **Migration des capabilities existantes ?**
9. **Impact sur les tests existants ?**

---

## 10. Références

- `docs/sprint-artifacts/bug-parallel-execution-tracking.md` - Bug original
- `docs/adrs/ADR-041-hierarchical-trace-tracking.md` - Trace hierarchy
- `docs/adrs/ADR-043-all-tools-must-succeed-capability-save.md` - Capability save rules
- `src/graphrag/dag/execution-learning.ts` - Learning from traces
- `src/graphrag/graph-engine.ts` - Graph updates
- `src/sandbox/worker-bridge.ts` - Trace collection
