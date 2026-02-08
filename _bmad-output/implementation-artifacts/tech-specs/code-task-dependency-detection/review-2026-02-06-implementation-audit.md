---
title: 'Implementation Audit - Code Task Dependency Detection'
date: '2026-02-06'
type: review
---

# Implementation Audit - 2026-02-06

## Executive Summary

**Phase 1A (Sequence Edges via `arguments`):** IMPLEMENTE ✅ (2026-02-06)
**Phase 1B (DAG Optimizer Rule 6 - no fusion for variable sequences):** IMPLEMENTE ✅ (2026-02-06)
**Phase 1C (Runtime variable unwrap):** IMPLEMENTE ✅ (2026-02-06)
**Phase 2 (Semantic Provides Edges):** 0%

Les pipelines lineaires multi-etapes avec variables intermediaires fonctionnent maintenant de bout en bout.
Les cas avances (fork/rejoin, BinaryExpression avec property access, reduce) restent a traiter.

---

## Ce qui FONCTIONNE aujourd'hui

### 1. Chained Operations (via `chainedFrom`)

**Fichier:** `src/capabilities/static-structure/edge-generators.ts:17-55`

Le chainage de methodes (`nums.filter().map().reduce()`) genere correctement des edges :
- `handleCallExpression()` set `metadata.chainedFrom` sur chaque appel chaine
- `generateChainedEdges()` cree des edges de type `sequence` depuis ce metadata
- **Resultat:** edges correctes, layers corrects, fusion possible

```typescript
// Ceci fonctionne - edges generees
const result = nums.filter(n => n > 2).map(n => n * 2).reduce((a, b) => a + b, 0);
// → n1(filter) → n2(map, chainedFrom:n1) → n3(reduce, chainedFrom:n2)
// → Edges: [n1→n2, n2→n3] ✅
```

### 2. DAG Optimizer Fusion

**Fichier:** `src/dag/dag-optimizer.ts`

La fusion fonctionne correctement pour les chaines detectees :
- `findSequentialChain()` trouve les chaines ou chaque tache depend uniquement de la precedente
- `canFuseTasks()` verifie : code_execution, executable, pas de MCP calls, `pure: true`
- `fuseTasks()` combine le code, merge les `literalBindings`, cree metadata `fusedFrom`/`logicalTools`
- **Limitation:** Si `dependsOn` est vide (cas broken), aucune chaine n'est trouvee

### 3. Layer Assignment

**Fichier:** `src/dag/topological-sort.ts`

`computeLayerIndexForTasks()` assigne correctement les layers depuis `dependsOn` :
- Layer 0 : pas de dependances
- Layer N+1 : taches dependant uniquement de Layer N
- Consomme par le server-side (`layer-results.ts`), le client-side (`code-execution-handler.ts`), et le frontend (`TraceTimeline.tsx`)

### 4. Frontend - Affichage des taches fusionnees

**Fichiers:** `src/web/components/ui/atoms/FusedTaskCard.tsx`, `src/web/components/ui/molecules/TraceTimeline.tsx`

Les taches fusionnees sont correctement affichees :
- `FusedTaskCard` avec details expandables
- Metadata `isFused` + `logicalOperations[]` persistees en DB
- Chaque operation logique affichee individuellement dans l'expansion

### 5. SHGAT Learning - NON IMPACTE (voir OBS-7)

**Fichier:** `src/graphrag/dag/execution-learning.ts`

Le learning SHGAT est empirique (runtime), pas structurel. Voir OBS-7 pour l'investigation detaillee.
Les edges manquantes dans la static structure n'affectent PAS le SHGAT.

### 6. `extractArgumentValue()` et `variableToNodeId`

**Fichier:** `src/capabilities/static-structure-builder.ts:1250-1361`

- `extractArgumentValue()` est maintenant **public** (etait private) ✅
- Gere : StringLiteral, NumericLiteral, BooleanLiteral, ObjectExpression, ArrayExpression, MemberExpression, Identifier (avec lookup `variableToNodeId`), TemplateLiteral, CallExpression
- `variableToNodeId` (ligne 99) est correctement peuple dans `handleVariableDeclarator()`
- ~~**Probleme:** Methode private, utilisee uniquement pour les MCP tools, pas pour les `code:*` tasks~~ → CORRIGE

---

## Ce qui etait BROKEN / MISSING (avant implementation)

### 1. ~~CRITIQUE - Aucune `arguments` sur les taches `code:*`~~ → CORRIGE ✅

| Operation | Location | arguments? |
|-----------|----------|:---:|
| Array methods (filter, map, etc.) | `static-structure-builder.ts:~541` | ✅ |
| String methods (split, replace) | `static-structure-builder.ts:~649` | ✅ |
| Object.keys/values/entries | `static-structure-builder.ts:~718` | ✅ |
| Math.abs/max/min | `static-structure-builder.ts:~760` | ✅ |
| JSON.parse/stringify | `static-structure-builder.ts:~815` | ✅ |
| Binary operators (+, -, ===) | `ast-handlers.ts:~571` | ✅ |

### 2. ~~CRITIQUE - Pas de sequence edges pour operations sequentielles avec variables~~ → CORRIGE ✅

Les edges sont maintenant generees via `nodeReferencesNode()` grace au champ `arguments` ajoute.
Verifie en live : `JSON.parse → Object.keys`, `filter → map`, pipeline 4 etapes.

### 3. ~~`HandlerContext` - `extractArgumentValue` non expose~~ → CORRIGE ✅

- `HandlerContext` a maintenant `extractArgumentValue?` (optionnel pour backward compat)
- `BuilderContextAdapter` delegue a `builder.extractArgumentValue()`
- `IStaticStructureBuilder` inclut `extractArgumentValue` dans son interface
- `extractArgumentValue` est maintenant `public` (etait `private`)

### 4. `code-semantic-types.ts` - N'existe pas (Phase 2, non planifie)

Le fichier `src/capabilities/static-structure/code-semantic-types.ts` avec `CODE_SEMANTIC_TYPES` n'a pas ete cree.
Les fonctions `inferCodeProvidesEdge()` et `isSemanticMatch()` n'existent pas.

### 5. DR-DSP - Non integre a l'execution (Phase 2, non planifie)

- L'algorithme DR-DSP fonctionne (`src/graphrag/algorithms/dr-dsp.ts`)
- Provides edges calculees et stockees en DB
- Mais utilise UNIQUEMENT pour le mode suggestion, pas pendant `pml execute`

### 6. Tests manquants (partiellement corrige)

**Fichier:** `tests/unit/capabilities/static-structure-code-ops.test.ts` (1152 lignes)

Teste actuellement :
- ✅ Detection d'operations code (filter, map, reduce, split, Object.keys, JSON.parse, etc.)
- ✅ Extraction de code via spans SWC
- ✅ Edges pour operations chainees (via `chainedFrom`)
- ✅ Variable bindings

**Fichier:** `tests/unit/dag/dag-optimizer.test.ts` (13 tests) - MIS A JOUR ✅
- ✅ `canFuseTasks` - method chain (chainedFrom) → true
- ✅ `canFuseTasks` - variable-based sequences (no chainedFrom) → false (NOUVEAU)
- ✅ `canFuseTasks` - MCP tasks → false
- ✅ `canFuseTasks` - MCP calls in code → false
- ✅ `canFuseTasks` - different permission sets → false
- ✅ `optimizeDAG` - fuses method chain tasks (chainedFrom)
- ✅ `optimizeDAG` - does NOT fuse variable-based sequential tasks (NOUVEAU)
- ✅ `optimizeDAG` - respects maxFusionSize (avec chainedFrom)

Ne teste PAS encore :
- ❌ Extraction d'`arguments` pour les taches `code:*` (tests unitaires specifiques)
- ❌ Semantic provides edges (Phase 2)
- ❌ Detection de dependances mixtes MCP + `code:*`

---

## Implementation (2026-02-06)

### Fix 1 : Extraction d'arguments pour tous les noeuds `code:*`

**Fichier:** `src/capabilities/static-structure-builder.ts`

Ajout du champ `arguments` a tous les points de creation de noeuds `code:*`. Chaque type d'operation extrait ses inputs differemment :

**Array methods** (filter, map, sort, reduce, etc.) — input = `callee.object`
```typescript
// Pour une chaine : chainedInputNodeId existe → reference directe
// Pour une variable : callee.object est un Identifier → lookup variableToNodeId
const codeArguments: ArgumentsStructure = {};
if (chainedInputNodeId) {
  codeArguments.input = { type: "reference", expression: chainedInputNodeId };
} else {
  const calleeObj = callee.object;
  const inputArg = this.extractArgumentValue(calleeObj);
  if (inputArg) codeArguments.input = inputArg;
}
```

**String methods** — meme pattern que array (input = `callee.object`)

**Object.keys/values/entries, JSON.parse/stringify** — input = premier argument de la fonction
```typescript
// Object.keys(data) → input = data (1er argument), pas callee.object
const objFnArgs = n.arguments as Array<...>;
const inputArg = this.extractArgumentValue(objFnArgs[0]);
```

**Math.abs/max/min** — tous les arguments de la fonction (input, arg1, arg2...)
```typescript
// Math.max(a, b, c) → input=a, arg1=b, arg2=c
```

**BinaryExpression** (+, -, ===, etc.) — left + right
```typescript
// a + b → left=a, right=b
const binArgs: ArgumentsStructure = {};
const leftArg = ctx.extractArgumentValue(n.left);
const rightArg = ctx.extractArgumentValue(n.right);
```

### Fix 2 : Variable mapping (handleVariableDeclarator)

**Fichier:** `src/capabilities/static-structure-builder.ts` (~ligne 959)

**Bug:** `handleVariableDeclarator` mappait la variable au DERNIER noeud cree (`n${nodeCountAfter}`), qui est souvent un noeud de callback imbrique (ex: `greaterThan` dans `filter(n => n > 5)`), au lieu de l'operation principale.

**Fix:** Scan inverse des noeuds crees pour trouver le dernier noeud EXECUTABLE :
```typescript
let mappedNodeId: string | undefined;
for (let i = nodeCountAfter; i >= nodeCountBefore + 1; i--) {
  const candidate = nodes.find((n) => n.id === `n${i}`);
  if (candidate?.type === "task" && candidate.metadata?.executable !== false) {
    mappedNodeId = candidate.id;
    break;
  }
}
```

### Fix 3 : DAG Optimizer Rule 6

**Fichier:** `src/dag/dag-optimizer.ts`

**Bug:** `canFuseTasks()` permettait la fusion de sequences avec variables intermediaires car tous les code:* tasks ont `pure: true`. La fusion concatenait le code sans declarations de variables → erreur de syntaxe.

**Fix:** Rule 6 — interdire la fusion sauf si `chainedFrom` est present :
```typescript
// Rule 6: Only method chains (with chainedFrom) can be fused
for (let i = 1; i < tasks.length; i++) {
  if (!tasks[i].metadata?.chainedFrom) {
    return false;
  }
}
```

**Logique :**
- Method chains (`.filter().map()`) : produisent 1 tache executable avec code complet → fusion OK
- Variable sequences (`const a = filter(); a.map()`) : produisent N taches separees → fusion INTERDITE

### Fix 4 : Runtime variable unwrap

**Fichier:** `src/dag/execution/code-task-executor.ts` (ligne ~86)

**Bug:** Les resultats des code tasks sont wrappes : `{ result: [6,7,8,9,10], state: {...}, executionTimeMs: 5.2 }`. L'injection de `variableBindings` passait l'objet wrappe entier au lieu de `.result`. Donc `filtered` recevait un objet au lieu d'un tableau → `filtered.map is not a function`.

**Fix:** Unwrap automatique de l'output avant injection :
```typescript
const rawOutput = depResult.output;
const actualValue =
  rawOutput && typeof rawOutput === "object" && "result" in rawOutput
    ? rawOutput.result
    : rawOutput;
executionContext[varName] = actualValue;
```

### Exposition de `extractArgumentValue`

**Fichiers modifies :**
- `static-structure-builder.ts` : `extractArgumentValue` passe de `private` a `public`
- `ast-handlers.ts` : `HandlerContext` interface + `extractArgumentValue?: (node) => ArgumentValue`
- `builder-context-adapter.ts` : `IStaticStructureBuilder` interface + delegation dans adapter

---

## Tests Live Post-Implementation

| Test | Code | Resultat | Details |
|------|------|----------|---------|
| A | `filter → map` (variables) | ✅ 142ms | `[12,14,16,18,20]` - 2 layers, 4 tools |
| B | `JSON.parse → Object.keys` | ✅ 101ms | `["name","age","city"]` - 2 layers |
| C | Pipeline 4 etapes (parse → filter → map → sort) | ✅ 212ms | `["Alice","Charlie","Diana"]` - 4 layers, 5 tools |
| D | Pipeline 8 etapes (parse → filter → map → sort → reduce → division → re-filter → object) | ❌ TIMEOUT | Fork (sorted reutilise 2x) + BinaryExpr property access |

### Cas encore non supportes (Future Work)

1. **Fork/rejoin** : une variable utilisee par 2+ taches downstream (ex: `sorted` utilise par `reduce` ET par `filter`)
2. **Property access dans BinaryExpression** : `total / sorted.length` - `sorted.length` est un MemberExpression sans appel, pas de noeud cree
3. **`reduce`** avec accumulateur : necessite investigation specifique sur la generation d'arguments
4. **Object literal construction** : `{ key: variable }` - pas de noeud cree, dependances non trackees

---

## Observations & Recommandations

### OBS-1: Incohérence de statut

Le frontmatter dit `status: 'approved'` mais le corps dit `Status: Draft`.
**Action:** Harmonise a `draft` tant que l'implementation n'est pas terminee.

### OBS-2: Estimation optimiste

La spec estime ~9-10h. L'audit revele que l'infra est plus prete que prevu (95%) mais :
- L'exposition de `extractArgumentValue` via HandlerContext necessite un refactor de visibilite
- Les tests existants couvrent deja bien les operations mais pas le resultat (edges)
- **Estimation revisee:** ~7-8h (Phase 1: 5h, Phase 2: 2h, buffer inclus)

### OBS-3: Fragilite de `isSemanticMatch()` par suffixe

La logique proposee `output.endsWith("_array")` est fragile :
```typescript
// Si on ajoute "nested_array_of_objects", il matcherait "array" incorrectement
if (input === "array" && output.endsWith("_array")) return true;
```

**Recommandation:** Utiliser une map de compatibilite explicite plutot qu'une heuristique par suffixe :
```typescript
const COMPATIBLE_TYPES: Record<string, string[]> = {
  "array": ["filtered_array", "mapped_array", "flattened_array", "sliced_array",
            "concatenated_array", "sorted_array", "reversed_array", "string_array",
            "value_array", "entries_array"],
  "object": ["json_object"],
  "string": ["joined_string", "json_string"],
};
```

### OBS-4: Cas non couverts dans la spec

La spec ne mentionne pas :
1. **Destructuring** : `const { data } = await mcp.db.query(...)` - le `variableToNodeId` associe-t-il `data` au noeud ?
2. **Spread operators** : `const merged = { ...a, ...b }` - comment tracker les dependances sur `a` et `b` ?
3. **Ternary / conditional** : `const val = cond ? a : b` - dependance sur `a` ET `b` ?
4. **Await dans expressions** : `const x = (await mcp.foo()).bar` - le noeud a-t-il arguments ?

**Recommandation:** Ajouter ces cas comme "Future Work" ou les investiguer avant implementation.

### OBS-5: ~~Fallback silencieux (violation de la regle projet)~~ → RESOLU

~~La situation actuelle viole `.claude/rules/no-silent-fallbacks.md`~~ → Corrige : les noeuds `code:*` ont maintenant des `arguments`, donc `nodeReferencesNode()` genere les edges correctement. Plus de `dependsOn: []` vides pour les pipelines lineaires.

### OBS-6: Fused task - resultats intermediaires perdus

**Fichier:** `src/dag/trace-generator.ts:224-245`

Les taches intermediaires d'une fusion recoivent `undefined` comme output au lieu de la valeur reelle. Seule la derniere tache a son output.

### OBS-7: SHGAT Learning - PAS impacte par les edges manquantes

**Investigation approfondie (2026-02-06)** : le SHGAT learning est **empirique, pas structurel**.

- `execution-learning.ts:81-198` : `updateFromCodeExecution()` recoit `TraceEvent[]` (runtime), PAS la static structure
- `execution-learning.ts:298-369` : `learnSequenceEdgesFromTasks()` apprend depuis `layerIndex` runtime
- `lib/shgat/src/graph/incidence.ts:74-151` : incidence matrix construite depuis `cap.members` (= `tools_used`), PAS `edges`

**Conclusion** : la spec originale surestimait l'impact SHGAT. Les edges manquantes n'affectent pas le learning.

### OBS-8: ~~CRITIQUE - Les edges manquantes causent des TIMEOUTS d'execution~~ → CORRIGE ✅

**Decouverte 2026-02-06** : le probleme etait beaucoup plus grave que decrit dans la spec originale.
**Corrige 2026-02-06** : implementation Phase 1A/1B/1C (voir section Implementation).

**Tests live AVANT implementation :**

| Test | Code | Resultat |
|------|------|----------|
| B | `JSON.parse` → `Object.keys(parsed)` | ❌ TIMEOUT 30s |
| E | `const filtered = filter()` → `const mapped = map()` | ❌ TIMEOUT 30s |

**Tests live APRES implementation :**

| Test | Code | Resultat |
|------|------|----------|
| B | `JSON.parse` → `Object.keys(parsed)` | ✅ 101ms |
| E | `const filtered = filter()` → `const mapped = map()` | ✅ 142ms |
| Pipeline 4 etapes | parse → filter → map → sort | ✅ 212ms, 4 layers |

---

## Severite revisee

~~La spec originale classait ce bug comme **optimisation** (fusion sous-optimale, layers incorrects).~~
~~L'audit revele que c'est un **bug bloquant d'execution** : toute chaine code:* avec variables intermediaires TIMEOUT.~~

**CORRIGE** : les pipelines lineaires avec variables intermediaires fonctionnent maintenant.
Les patterns encore non supportes sont documentes dans "Tests Live Post-Implementation" ci-dessus.

---

## Roadmap (mise a jour apres implementation)

### Phase 1A - Extraction d'arguments → FAIT ✅
1. ✅ Exposer `extractArgumentValue` (public + HandlerContext + BuilderContextAdapter)
2. ✅ Array methods : extraire callee.object comme `input`
3. ✅ String methods : meme pattern que array
4. ✅ Object/Math/JSON : extraire `arguments[0]` comme `input`
5. ✅ BinaryExpression : extraire left/right

### Phase 1B - DAG Optimizer → FAIT ✅
1. ✅ Rule 6 : interdire fusion des sequences sans `chainedFrom`
2. ✅ Fix semicolons dans `generateFusedCode()`
3. ✅ Tests mis a jour (13/13 passent)

### Phase 1C - Runtime Variable Injection → FAIT ✅
1. ✅ Unwrap output `{ result, state, executionTimeMs }` → `.result`
2. ✅ Fix variable mapping dans `handleVariableDeclarator` (dernier noeud executable)

### Phase 1D - Tests unitaires specifiques (TODO)
1. Tests d'extraction d'`arguments` par type d'operation (verifier le contenu)
2. Tests de generation de sequence edges pour pipelines avec variables
3. Tests de regression pour les chained operations

### Phase 2 - Semantic Provides Edges (TODO)
1. Creer `code-semantic-types.ts` avec map de compatibilite explicite (30min)
2. Implementer `inferCodeProvidesEdge()` + `isSemanticMatch()` (1h)
3. Tests DR-DSP path finding (30min)

### Phase 3 - Cas avances (Future Work)
- **Fork/rejoin** : variable reutilisee par 2+ taches downstream
- **Property access** : `sorted.length` dans expressions (MemberExpression sans appel)
- **Destructuring** : `const { data } = await mcp.db.query(...)`
- **Spread operators** : `const merged = { ...a, ...b }`
- **Ternary** : `const val = cond ? a : b`
- **Object literal** : `{ key: variable }` comme valeur de retour
- **reduce** avec accumulateur complexe
- Integrer DR-DSP dans le flow d'execution (pas juste suggestion)
- Capturer les resultats intermediaires des taches fusionnees

---

## Fichiers cles references

| Fichier | Role | Modifie? |
|---------|------|:---:|
| `src/capabilities/static-structure-builder.ts` | Builder principal, `extractArgumentValue()` (public), `variableToNodeId`, arguments extraction | ✅ |
| `src/capabilities/static-structure/ast-handlers.ts` | Handlers AST, BinaryExpression arguments, `HandlerContext.extractArgumentValue` | ✅ |
| `src/capabilities/static-structure/builder-context-adapter.ts` | Adapter HandlerContext ↔ Builder, `IStaticStructureBuilder.extractArgumentValue` | ✅ |
| `src/capabilities/static-structure/edge-generators.ts` | `nodeReferencesNode()`, `generateChainedEdges()`, `generateSequenceEdges()` | — |
| `src/dag/dag-optimizer.ts` | `canFuseTasks()` Rule 6, `generateFusedCode()` semicolons | ✅ |
| `src/dag/execution/code-task-executor.ts` | Variable injection unwrap `.result` | ✅ |
| `src/dag/topological-sort.ts` | `computeLayerIndexForTasks()` | — |
| `src/dag/trace-generator.ts` | Metadata fusion pour traces | — |
| `src/graphrag/dag/execution-learning.ts` | Learning SHGAT depuis traces | — |
| `tests/unit/dag/dag-optimizer.test.ts` | Tests optimizer (13 tests, chainedFrom + variable sequences) | ✅ |
| `tests/unit/capabilities/static-structure-code-ops.test.ts` | Tests existants (1152 lignes, 72 tests) | — |
