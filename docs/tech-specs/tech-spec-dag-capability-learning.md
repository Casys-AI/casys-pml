# Tech Spec: DAG, Capabilities & Learning Architecture

**Status:** 📋 DRAFT - Discussion
**Date:** 2025-12-16
**Authors:** Discussion Claude + User
**Related:** `bug-parallel-execution-tracking.md`, ADR-041, ADR-043

---

## Executive Summary

Cette tech spec adresse plusieurs questions architecturales interconnectées autour de l'apprentissage depuis les DAGs et le code, la création de capabilities, et la cohérence du modèle de données.

### Décision clé : Unification des APIs

**On unifie les tools MCP en deux points d'entrée principaux :**

| Avant (fragmenté) | Après (unifié) |
|-------------------|----------------|
| `pml_search_tools` | `pml_discover` |
| `pml_search_capabilities` | `pml_discover` |
| `pml_find_capabilities` | `pml_discover` |
| `pml_execute_dag` | `pml_execute` |
| `pml_execute_code` | `pml_execute` |

> **Pourquoi `discover` ?** Le système explore intelligemment le graphe, pas juste une recherche textuelle.

### Problèmes identifiés

1. **Parallel tracking** : Les tools exécutés en parallèle ne créent pas d'edges
2. **DAG → Capability** : Un DAG exécuté avec succès ne génère pas de capability
3. **Edge types confus** : `sequence` vs `dependency` - quelle différence ?
4. **Co-occurrence manquant** : Pas d'edge type pour "utilisés ensemble"
5. **Code vs DAG** : Tension entre les deux modèles d'exécution
6. **APIs fragmentées** : Trop de tools séparés, l'IA peut bypass le système
7. **Mode definition vs invocation** : Pas de distinction dans le data model

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

## 5. Architecture unifiée : `pml_discover` et `pml_execute`

### 5.1 Le problème des APIs fragmentées

Actuellement, l'IA peut "bypass" le système GraphRAG en utilisant `execute_code` directement :

```
execute_dag:  Intent → Recherche → Suggestion → Exécution → Learning ✅
execute_code: Code → Exécution → (traces mal exploitées) ❌
```

On veut que **tout** passe par le même système d'apprentissage.

### 5.2 Solution : Deux APIs unifiées

#### `pml_discover` - Découverte unifiée

```typescript
pml_discover({
  intent: "lire et parser un fichier JSON",

  // Filtres optionnels
  filter?: {
    type?: "tool" | "capability" | "all",  // default: "all"
    minScore?: number,
  },

  limit?: number,  // default: 10
})

// Retourne
{
  results: [
    { type: "capability", id: "cap_123", intent: "...", score: 0.92,
      source: { type: "code", code: "..." } },
    { type: "tool", id: "fs:read", description: "...", score: 0.85 },
    { type: "capability", id: "cap_456", intent: "...", score: 0.78,
      source: { type: "dag", dagStructure: {...} } },
  ]
}
```

#### `pml_execute` - Exécution unifiée

```typescript
pml_execute({
  intent: "analyser ce fichier JSON et extraire les utilisateurs actifs",

  // Optionnel - si l'IA veut forcer une implémentation
  implementation?: {
    type: "code" | "dag",
    code?: string,
    dagStructure?: DAGStructure,
  }
})
```

### 5.3 Flow de `pml_execute`

```
┌─────────────────────────────────────────────────────┐
│                    INTENT                           │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│  Implementation fournie ?                           │
└─────────────────────┬───────────────────────────────┘
                      │
         ┌────────────┴────────────┐
         ▼                         ▼
       OUI                        NON
         │                         │
         ▼                         ▼
   Exécute le code/dag      Recherche dans graphe :
   fourni par l'IA          - Tools qui matchent
         │                  - Capabilities (code/dag)
         │                         │
         │            ┌────────────┴────────────┐
         │            ▼                         ▼
         │      Confiance haute           Confiance basse
         │      (> seuil)                 (< seuil)
         │            │                         │
         │            ▼                         ▼
         │      EXÉCUTE                   RETOURNE
         │      (speculation)             suggestions
         │            │                         │
         └────────────┴────────────┬────────────┘
                                   ▼
                           Après succès :
                           - Crée/update capability
                           - Update edges (graphe)
                           - Trace structure (parallel, etc.)
```

### 5.4 Mapping avec les anciens tools

| Ancien tool | Nouveau | Notes |
|-------------|---------|-------|
| `pml_search_tools` | `pml_discover({ filter: { type: "tool" } })` | Filtre sur tools |
| `pml_search_capabilities` | `pml_discover({ filter: { type: "capability" } })` | Filtre sur capabilities |
| `pml_find_capabilities` | `pml_discover` | Même chose |
| `pml_execute_dag` | `pml_execute({ implementation: { type: "dag", ... } })` | DAG explicite |
| `pml_execute_code` | `pml_execute({ implementation: { type: "code", ... } })` | Code explicite |
| (nouveau) | `pml_execute({ intent: "..." })` | Laisse le système choisir |

### 5.5 Avantages

1. **Pas de bypass** : Tout passe par le même système
2. **Apprentissage unifié** : Code ou DAG, on apprend pareil
3. **Suggestion intelligente** : Le système propose tools ET capabilities
4. **Simplicité pour l'IA** : Deux tools au lieu de cinq

### 5.6 Speculation

Avec l'architecture unifiée, la speculation fonctionne pour les deux :

- Si le système connaît une capability pour l'intent → exécute en speculation
- Si le système construit un DAG depuis le graphe → même logique qu'avant
- Si confiance basse → retourne suggestions, l'IA choisit

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

## 8. Apprentissage depuis le code (style Temporal)

### 8.1 Philosophie

Inspiré de [Temporal](https://temporal.io/) : le code s'exécute, on trace, on reconstruit la structure après.

> "Il est impossible de visualiser le DAG avant l'exécution car le code est dynamique.
> Mais on peut reconstruire la structure depuis les traces."

### 8.2 Flow d'apprentissage

```
┌─────────────────────────────────────────────────────┐
│  L'IA écrit du code naturel                         │
│  (Promise.all, await, loops, etc.)                  │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│  Le code S'EXÉCUTE                                  │
│  Worker trace chaque tool call avec :               │
│  - ts (timestamp start)                             │
│  - durationMs                                       │
│  - parentTraceId (hiérarchie)                       │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│  RECONSTRUCTION de la structure                     │
│  - Timestamps overlap → co-occurrence (parallel)    │
│  - Timestamps séquentiels → sequence                │
│  - parentTraceId → contains (hierarchy)             │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│  Stocker comme CAPABILITY                           │
│  - code original                                    │
│  - inferredStructure (le "DAG implicite")           │
│  - edges dans le graphe                             │
└─────────────────────────────────────────────────────┘
```

### 8.3 Structure de la Capability unifiée

```typescript
interface Capability {
  id: string;
  intent: string;

  // Source originale (ce que l'IA a écrit)
  source:
    | { type: "code"; code: string }
    | { type: "dag"; dagStructure: DAGStructure };

  // Structure RECONSTRUITE depuis l'exécution
  // Permet au suggester de travailler même avec du code
  inferredStructure: {
    tools: string[];
    edges: Array<{
      from: string;
      to: string;
      type: "sequence" | "co-occurrence" | "contains";
    }>;
  };

  // Metadata
  toolsUsed: string[];
  executionCount: number;
  avgDurationMs: number;
  successRate: number;
}
```

### 8.4 Reconstruction des dépendances data (vrai `dependsOn`)

Pour reconstruire un DAG **ré-exécutable** depuis le code, on doit détecter les **dépendances data** :
si le résultat du nœud A est utilisé dans les arguments du nœud B, alors B dépend de A.

#### Types de dépendances data

Les nœuds peuvent être des **tools** OU des **capabilities**. La détection s'applique à tous :

| From | To | Exemple |
|------|----|---------|
| Tool → Tool | `json:parse` utilise le result de `fs:read` |
| Tool → Capability | `cap:analyze` utilise le result de `fs:read` |
| Capability → Tool | `http:post` utilise le result de `cap:transform` |
| Capability → Capability | `cap:summarize` utilise le result de `cap:extract` |

> **Note:** L'edge `contains` (existant) capture la **hiérarchie d'appel** (qui appelle qui).
> Les dépendances data capturent le **flux de données** (qui utilise le résultat de qui).
> Ce sont deux informations complémentaires.

#### Ce qu'il faut tracer

Actuellement on trace `args` mais **pas `result`**. Il faut ajouter le result dans les deux types d'événements :

> **Note (2025-12-16):** Story 7.6 (Algorithm Observability) ne couvre PAS ceci.
> Story 7.6 trace les décisions algorithmiques (scores de CapabilityMatcher, DAGSuggester),
> pas les résultats d'exécution. Le traçage de `result` est **nouveau travail**.

**1. Pour `tool_end` (worker-bridge.ts ligne ~426) :**

```typescript
this.traces.push({
  type: "tool_end",
  tool: toolId,
  traceId: id,
  ts: endTime,
  success: !isToolError,
  durationMs: durationMs,
  parentTraceId: parentTraceId,
  result: result,  // ← AJOUTER
});
```

**2. Pour `capability_end` (code-generator.ts ligne ~104) :**

```typescript
// Dans le code généré pour les capabilities
__trace({
  type: "capability_end",
  capability: "${name}",
  capabilityId: "${capability.id}",
  success: __capSuccess,
  error: __capError?.message,
  result: __capResult,  // ← AJOUTER (le retour de la capability)
});
```

#### Algorithme de détection

```typescript
function detectDataDependencies(traces: TraceEvent[]): string[] {
  const dependsOn: string[] = [];

  for (const prevTrace of traces) {
    if (prevTrace.traceId === currentTrace.traceId) continue;
    if (prevTrace.ts >= currentTrace.ts) continue;

    // Si le result de prevTrace est dans les args de currentTrace
    if (containsValue(currentTrace.args, prevTrace.result)) {
      dependsOn.push(prevTrace.traceId);
    }
  }

  return dependsOn;
}

function containsValue(args: unknown, result: unknown): boolean {
  const argsStr = JSON.stringify(args);
  const resultStr = JSON.stringify(result);

  // Match exact
  if (argsStr.includes(resultStr)) return true;

  // Match partiel (pour les champs extraits d'un objet)
  if (typeof result === 'object' && result !== null) {
    for (const val of Object.values(result)) {
      if (argsStr.includes(JSON.stringify(val))) return true;
    }
  }

  return false;
}
```

#### Exemple

```typescript
// Traces
t1: { tool: "fs:read", args: { path: "config.json" }, result: { content: '{"url":"..."}' } }
t2: { tool: "json:parse", args: { json: '{"url":"..."}' }, result: { url: "..." } }
t3: { tool: "http:fetch", args: { url: "..." }, result: { data: [...] } }

// DAG reconstruit avec vraies dépendances
{
  tasks: [
    { id: "t1", tool: "fs:read", dependsOn: [] },
    { id: "t2", tool: "json:parse", dependsOn: ["t1"] },     // t2.args contient t1.result
    { id: "t3", tool: "http:fetch", dependsOn: ["t2"] },     // t3.args contient t2.result
  ]
}
```

### 8.5 Explicit vs Inferred `dependsOn`

Il y a deux types de dépendances, qui ne sont pas équivalentes :

| Type | Source | Sémantique | Exemple |
|------|--------|------------|---------|
| **Explicit** | DAG `dependsOn` | Intent de contrôle : "B attend A" | Side effects, ordering |
| **Inferred** | Traces args/result | Data flow : "B utilise result de A" | Vraies dépendances data |

#### Pourquoi les deux ?

```typescript
// DAG explicite
tasks: [
  { id: "A", tool: "fs:read", dependsOn: [] },
  { id: "B", tool: "log:write", dependsOn: ["A"] },   // Explicit: attend A (pour logging)
  { id: "C", tool: "json:parse", dependsOn: ["A"] },  // Explicit: attend A
]

// Après exécution, on infère :
// - C.args contient A.result → inferredDependsOn: ["A"] ✅
// - B.args ne contient PAS A.result → inferredDependsOn: [] (juste ordering)
```

| Situation | Explicit | Inferred |
|-----------|----------|----------|
| B utilise le result de A | `["A"]` | `["A"]` ✅ |
| B doit juste attendre A (side effect) | `["A"]` | `[]` |
| B utilise A mais dev a oublié | `[]` | `["A"]` 🔍 |

#### Modèle de données

```typescript
interface TaskDependencies {
  // Déclaré par l'utilisateur/IA (DAG original)
  explicitDependsOn?: string[];

  // Calculé depuis les traces (args contient result)
  inferredDependsOn: string[];

  // Pour ré-exécution : union des deux
  // effectiveDependsOn = explicitDependsOn ∪ inferredDependsOn
  effectiveDependsOn: string[];
}
```

#### Règles de fusion

1. **DAG → Capability** : On garde `explicitDependsOn`, on calcule `inferredDependsOn` depuis traces
2. **Code → Capability** : Pas d'explicit, tout est `inferredDependsOn`
3. **Ré-exécution** : Utilise `effectiveDependsOn` = union des deux
4. **Validation** : Si `inferred ⊄ explicit`, warning potentiel (dépendance manquante déclarée)

### 8.6 Ce que ça change pour le DAG Suggester

Le suggester peut maintenant travailler avec les deux :

1. **Capabilities avec DAG explicite** : Utilise le `dagStructure` + enrichit avec `inferredDependsOn`
2. **Capabilities avec code** : Utilise le `reconstructedDAG` avec `inferredDependsOn`

Dans les deux cas, il a un DAG complet avec `effectiveDependsOn` qu'il peut suggérer ou ré-exécuter.

### 8.7 Limites de la reconstruction et mitigations

#### Limites identifiées

| Limite | Description | Impact |
|--------|-------------|--------|
| **Dynamique** | Chaque exécution = un chemin. Les branches non explorées ne sont pas tracées | DAG incomplet pour code avec `if/else` |
| **Matching partiel** | Si on utilise `result.data.items[0].id`, le match JSON peut rater | Faux négatifs sur dépendances |
| **Side effects externes** | "Write file A puis read file B" sans lien data | Dépendances invisibles |
| **Closures/État** | Variables capturées hors du flow tracé | Dépendances implicites manquées |
| **Loops** | Boucles dynamiques avec nombre variable d'itérations | Structure non-DAG |

#### Pistes de mitigation

##### 1. Dry Run (Safe-to-Fail Execution)

Exécuter le code en mode "exploration" pour découvrir les branches :

```typescript
interface DryRunConfig {
  mode: "explore";           // Explorer toutes les branches
  maxBranches: number;       // Limite de branches à explorer
  failSafe: true;            // Les erreurs ne cassent pas l'exploration
  collectTraces: true;       // Collecter les traces de toutes les branches
}

// Résultat : traces de TOUTES les branches explorées
const branches = await dryRun(code, config);
// branches[0] = traces si condition A vraie
// branches[1] = traces si condition A fausse
```

**Avantages :**
- Découvre les chemins alternatifs
- Permet de construire un DAG plus complet
- Identifie les branches non couvertes

##### 2. Mock d'arguments

Injecter des arguments fictifs pour explorer des chemins spécifiques :

```typescript
interface MockConfig {
  argMocks: Record<string, unknown>;  // Forcer certains args
  // Exemple: { "config.env": "production" } → explore la branche prod
}

const traces = await executeWithMocks(code, mockConfig);
```

**Use cases :**
- Tester le comportement avec différentes configs
- Explorer les branches error handling
- Valider les chemins edge cases

##### 3. Mock de résultats

Simuler les résultats de tools pour éviter les side effects :

```typescript
interface ResultMockConfig {
  toolMocks: Record<string, unknown>;  // Simuler les résultats
  // Exemple: { "http:post": { status: 500 } } → explore la branche erreur
}

const traces = await executeWithResultMocks(code, resultMockConfig);
```

**Use cases :**
- Tester error handling sans vraies erreurs
- Explorer les branches de retry/fallback
- Éviter les side effects réels (DB writes, API calls)

##### 4. Combinaison : Exploration complète

```typescript
// Découvrir le DAG complet d'une capability
async function exploreCapability(capabilityId: string): Promise<CompleteDAG> {
  const capability = await getCapability(capabilityId);

  // 1. Exécution normale → chemin principal
  const mainPath = await execute(capability);

  // 2. Dry run avec mocks → branches alternatives
  const altPaths = await Promise.all([
    executeWithMocks(capability, { "config.env": "staging" }),
    executeWithResultMocks(capability, { "http:get": { error: true } }),
    // ... autres scénarios
  ]);

  // 3. Fusionner tous les chemins en un DAG complet
  return mergePathsToDAG([mainPath, ...altPaths]);
}
```

##### 5. Annotations explicites (fallback)

Pour les cas vraiment complexes, permettre des annotations :

```typescript
// Dans le code de la capability
// @pml-depends: ["fs:read", "config:load"]
// @pml-branches: ["success", "error", "retry"]
const result = await complexOperation();
```

Ces annotations seraient lues par le système pour enrichir le DAG inféré.

#### Priorité des mitigations

| Mitigation | Complexité | Valeur | Priorité |
|------------|------------|--------|----------|
| Dry run safe-to-fail | Moyenne | Haute | P1 - Phase future |
| Mock de résultats | Faible | Haute | P1 - Facile à implémenter |
| Mock d'arguments | Faible | Moyenne | P2 |
| Exploration complète | Haute | Très haute | P3 - Long terme |
| Annotations | Faible | Basse | P4 - Fallback |

> **Note :** Ces mitigations sont pour une phase future. La Phase 1-2 du plan actuel
> couvre 80-90% des cas d'usage avec la reconstruction basique depuis traces.

---

## 9. Plan d'implémentation

### Phase 1 : Enrichir le tracing (Quick Win)

1. **Ajouter `result` dans les traces :**
   - `tool_end` dans `worker-bridge.ts` ligne ~426
   - `capability_end` dans `code-generator.ts` ligne ~104
2. Modifier `execution-learning.ts` pour utiliser les timestamps (`ts`, `durationMs`)
3. Ajouter edge type `co-occurrence` dans `edge-weights.ts`
4. Détecter overlap temporel pour créer les bons edges

**Fichiers :** `worker-bridge.ts`, `code-generator.ts`, `execution-learning.ts`, `edge-weights.ts`, `types.ts`
**Effort estimé :** 1-2 jours

### Phase 2 : Reconstruction DAG depuis traces

1. Implémenter `detectDataDependencies()` - analyser args/result pour trouver les dépendances
2. Implémenter `reconstructDAG()` - construire un DAGStructure complet depuis les traces
3. Combiner avec timestamps pour parallel vs sequence

**Fichiers :** `execution-learning.ts` (nouveau module `dag-reconstruction.ts`)
**Effort estimé :** 2-3 jours

### Phase 3 : Capability unifiée

1. Ajouter `source` (code OU dag) dans `Capability`
2. Ajouter `reconstructedDAG` pour les capabilities code
3. Créer capability après TOUT succès (code ou DAG)

**Fichiers :** `capability-store.ts`, `types.ts`, migrations
**Effort estimé :** 2-3 jours

### Phase 4 : API unifiée `pml_discover`

1. Créer nouveau handler `pml_discover` qui explore tools ET capabilities
2. Retourner résultats unifiés avec scores
3. Déprécier `pml_search_tools`, `pml_search_capabilities`, `pml_find_capabilities`

> **Spec séparée requise :** La gestion du contexte (verbosity levels, progressive disclosure,
> résumés de capabilities multi-parties) sera traitée dans une tech spec dédiée à `pml_discover`.
> Voir les handlers existants : `search-tools.ts`, `search-capabilities.ts`.

**Fichiers :** `gateway-server.ts`, handlers
**Effort estimé :** 2-3 jours

### Phase 5 : API unifiée `pml_execute`

1. Créer nouveau handler `pml_execute`
2. Implémenter le flow : intent → recherche → suggestion/exécution
3. Déprécier `pml_execute_dag` et `pml_execute_code`
4. Assurer l'apprentissage unifié après succès

**Fichiers :** `gateway-server.ts`, `controlled-executor.ts`, handlers
**Effort estimé :** 3-5 jours

### Phase 6 : Definition vs Invocation

1. Ajouter table `capability_invocations`
2. Logger chaque exécution avec args et résultats
3. Adapter l'API pour Fresh UI

**Fichiers :** `capability-store.ts`, migrations, API
**Effort estimé :** 2-3 jours

### Ordre recommandé

```
Phase 1 (tracing) → Phase 2 (reconstruction) → Phase 3 (capability) → Phase 4 (discover) → Phase 5 (execute) → Phase 6 (invocations)
```

Les phases 1-3 sont le cœur du système d'apprentissage.
Les phases 4-5 sont l'unification des APIs.
La phase 6 est pour l'UX Fresh.

---

## 10. Questions ouvertes (À discuter)

### Résolues ✅

1. ~~Option A vs B vs C pour DAG → Capability ?~~ → **Option A** : Capability = code OU dag
2. ~~Fusionner sequence/dependency ou garder les deux ?~~ → **Garder les deux** (sémantique différente)
3. ~~Comment l'IA choisit entre code et DAG ?~~ → **Elle ne choisit plus** : `pml_execute` unifié
4. ~~APIs fragmentées ?~~ → **Unification** : `pml_discover` + `pml_execute`

### Ouvertes

5. **Co-occurrence bidirectionnel ou directionnel ?**
   - Option A : Deux edges A→B et B→A
   - Option B : Un edge bidirectionnel A↔B

6. **Seuil de confiance pour speculation ?**
   - Même seuil pour code et DAG ?
   - Adapter selon le type ?

7. **Rétention des invocations** (pour mode definition/invocation)
   - Combien garder par capability ?
   - TTL ?

8. **Migration des capabilities existantes**
   - Ajouter `source: { type: "code" }` aux existantes ?
   - Recalculer `inferredStructure` depuis les traces ?

9. **Backward compatibility**
   - Garder les anciens tools en mode déprécié ?
   - Période de transition ?

---

## 11. Références

- `docs/sprint-artifacts/bug-parallel-execution-tracking.md` - Bug original
- `docs/adrs/ADR-041-hierarchical-trace-tracking.md` - Trace hierarchy
- `docs/adrs/ADR-043-all-tools-must-succeed-capability-save.md` - Capability save rules
- `src/graphrag/dag/execution-learning.ts` - Learning from traces
- `src/graphrag/graph-engine.ts` - Graph updates
- `src/sandbox/worker-bridge.ts` - Trace collection
