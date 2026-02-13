# Tech Spec : Sparse Message Passing + Parquet Dataset (2026-02-13)

## Contexte

Le training SHGAT OB (`train-ob.ts`) avec la vraie hiérarchie (7047 caps n8n au level 0, 9 caps DB au level 1) crash en OOM à ~12-20GB. La cause : les phases MP (V→E, E→V, E→E) utilisent des **matrices de connectivité denses** `number[][]` de taille `[numTools × numCaps]` = `[1901 × 7047]` = 13.4M entries.

Même si le code itère avec `connectivity[t][c] === 1`, il alloue :
- `attentionScores[1901][7047]` = 107MB (dense, 99% à -Infinity)
- `attentionVE[1901][7047]` = 107MB (dense, 99% à 0)
- `concatPreAct` Map : ~35K entries ≈ OK (sparse par construction)
- Tout ça × 16 heads × 2 directions (upward/downward) × cache backward = **~7GB** pour les attention matrices seules

Ajouté au dataset en mémoire (~8-10GB) → OOM.

## Partie 1 : Sparse Message Passing

### 1.1 Structure de données cible

Remplacer les matrices denses par des **adjacency lists** :

```typescript
/** Sparse connectivity — remplace number[][] */
interface SparseConnectivity {
  /** Pour chaque source, liste des targets connectés */
  sourceToTargets: Map<number, number[]>;
  /** Pour chaque target, liste des sources connectées */
  targetToSources: Map<number, number[]>;
  numSources: number;
  numTargets: number;
}
```

**Mémoire** : 7047 caps × ~5 tools/cap = ~35K edges × 2 directions × 8 bytes = **~560KB** (vs 107MB dense).

### 1.2 Fichiers impactés

| Fichier | Lignes | Changement |
|---------|--------|------------|
| `vertex-to-edge-phase.ts` | 353 | `connectivity: number[][]` → `SparseConnectivity` |
| `edge-to-vertex-phase.ts` | 353 | idem |
| `edge-to-edge-phase.ts` | 344 | `containment: number[][]` → `SparseConnectivity` |
| `multi-level-orchestrator.ts` | 1263 | Adapter les appels, `toolToCapMatrix` → sparse |
| `phase-interface.ts` | ~60 | Type `connectivity` dans `PhaseParameters` |
| `tools/train-ob.ts` | ~1100 | `buildGraphStructure()` retourne sparse, backward compatible |

**Total** : ~2473 lignes à modifier. Les phases (VE, EV, EE) ont une structure symétrique — le pattern est le même pour les 3.

### 1.3 Pattern de migration (V→E comme exemple)

**Avant** (dense) :
```typescript
// Attention scores: dense [numTools × numCaps], 99% à -Infinity
const attentionScores: number[][] = Array.from(
  { length: numTools },
  () => Array(numCaps).fill(-Infinity),
);

for (let t = 0; t < numTools; t++) {
  for (let c = 0; c < numCaps; c++) {
    if (connectivity[t][c] === 1) {
      const concat = [...H_proj[t], ...E_proj[c]];
      concatPreAct.set(`${t}:${c}`, concat);
      const activated = concat.map(x => math.leakyRelu(x, slope));
      attentionScores[t][c] = math.dot(params.a_attention, activated);
    }
  }
}

// Softmax per cap (itère TOUTE la matrice pour trouver les 1s)
for (let c = 0; c < numCaps; c++) {
  const toolsInCap: number[] = [];
  for (let t = 0; t < numTools; t++) {
    if (connectivity[t][c] === 1) toolsInCap.push(t);
  }
  // ...softmax sur toolsInCap...
}
```

**Après** (sparse) :
```typescript
// Attention scores: sparse, seulement les edges qui existent
const attentionScores = new Map<string, number>(); // "t:c" → score

for (const [c, tools] of conn.targetToSources) {
  for (const t of tools) {
    const concat = [...H_proj[t], ...E_proj[c]];
    concatPreAct.set(`${t}:${c}`, concat);
    const activated = concat.map(x => math.leakyRelu(x, slope));
    attentionScores.set(`${t}:${c}`, math.dot(params.a_attention, activated));
  }
}

// Softmax per cap (direct — on a déjà la liste des tools)
const attentionVE = new Map<string, number>(); // "t:c" → attention weight

for (const [c, tools] of conn.targetToSources) {
  if (tools.length === 0) continue;
  const scores = tools.map(t => attentionScores.get(`${t}:${c}`)!);
  const softmaxed = math.softmax(scores);
  for (let i = 0; i < tools.length; i++) {
    attentionVE.set(`${tools[i]}:${c}`, softmaxed[i]);
  }
}
```

**Complexité** : O(edges) au lieu de O(numTools × numCaps). Pour 35K edges vs 13.4M : **380x moins d'itérations**.

### 1.4 Aggregation (E_new et H_new)

**Avant** :
```typescript
// E_new[c] = Σ_t attention[t][c] * H_proj[t]
for (let c = 0; c < numCaps; c++) {
  const sum = Array(projDim).fill(0);
  for (let t = 0; t < numTools; t++) {
    if (attentionVE[t][c] > 0) {
      for (let d = 0; d < projDim; d++) sum[d] += attentionVE[t][c] * H_proj[t][d];
    }
  }
  E_new.push(sum);
}
```

**Après** :
```typescript
// E_new[c] = Σ_t attention["t:c"] * H_proj[t]
const E_new: number[][] = Array.from({ length: conn.numTargets }, () => Array(projDim).fill(0));
for (const [c, tools] of conn.targetToSources) {
  for (const t of tools) {
    const alpha = attentionVE.get(`${t}:${c}`) ?? 0;
    if (alpha > 0) {
      for (let d = 0; d < projDim; d++) E_new[c][d] += alpha * H_proj[t][d];
    }
  }
}
```

### 1.5 Backward (même pattern)

Le backward des phases suit exactement la même structure que le forward :
- Itère sur les edges existants (pas sur toute la matrice)
- Accumule les gradients dW_source, dW_target, da_attention
- Les gradients dH et dE sont accumulés uniquement pour les tools/caps qui participent à des edges

La migration backward est mécanique : remplacer les boucles `for t for c if connectivity[t][c]` par `for (c, tools) of conn.targetToSources for t of tools`.

### 1.6 Cache backward (MultiLevelBackwardCache)

**Avant** :
```typescript
toolToCapMatrix: number[][];         // [1901 × 7047] = 107MB
capToCapMatrices: Map<number, number[][]>; // [7047 × 9] ≈ OK
```

**Après** :
```typescript
toolToCapConn: SparseConnectivity;   // ~560KB
capToCapConns: Map<number, SparseConnectivity>; // ~1KB
```

### 1.7 buildGraphStructure() dans train-ob.ts

```typescript
// Avant: dense matrix
const toolToCapMatrix: number[][] = Array.from({ length: toolIds.length },
  () => Array(caps0.length).fill(0));
for (let c = 0; c < caps0.length; c++) {
  for (const childId of capNode.children) {
    const tIdx = toolIdxMap.get(childId);
    if (tIdx !== undefined) toolToCapMatrix[tIdx][c] = 1;
  }
}

// Après: sparse adjacency
const toolToCaps = new Map<number, number[]>();
const capToTools = new Map<number, number[]>();
for (let c = 0; c < caps0.length; c++) {
  const tools: number[] = [];
  for (const childId of capNode.children) {
    const tIdx = toolIdxMap.get(childId);
    if (tIdx !== undefined) {
      tools.push(tIdx);
      if (!toolToCaps.has(tIdx)) toolToCaps.set(tIdx, []);
      toolToCaps.get(tIdx)!.push(c);
    }
  }
  capToTools.set(c, tools);
}
```

### 1.8 Estimation mémoire après migration

| Composant | Dense (actuel) | Sparse (cible) |
|-----------|---------------|----------------|
| toolToCapMatrix | 107 MB | 0.6 MB |
| attentionScores × 16 heads | 1.7 GB | 4.5 MB |
| attentionVE × 16 heads | 1.7 GB | 4.5 MB |
| concatPreAct Map | ~35 MB | ~35 MB (inchangé) |
| Backward caches (idem) | ~3.4 GB | ~9 MB |
| **Total MP** | **~7 GB** | **~54 MB** |

**Gain : ~130x moins de mémoire MP**. Le training devrait tenir dans 12GB (8GB dataset + 54MB MP + overhead).

### 1.9 Plan d'implémentation

| # | Étape | Effort |
|---|-------|--------|
| 1 | Ajouter `SparseConnectivity` type dans `types.ts` | 10 min |
| 2 | Migrer `vertex-to-edge-phase.ts` forward + backward | 45 min |
| 3 | Migrer `edge-to-vertex-phase.ts` (symétrique à VE) | 30 min |
| 4 | Migrer `edge-to-edge-phase.ts` | 30 min |
| 5 | Adapter `multi-level-orchestrator.ts` (types + appels) | 45 min |
| 6 | Adapter `train-ob.ts` buildGraphStructure + appels | 30 min |
| 7 | Tests : vérifier que sparse ≡ dense sur petit graphe | 30 min |
| **Total** | | **~3h30** |

### 1.10 Stratégie de test

Créer un test qui :
1. Construit un petit graphe (5 tools, 3 caps, 1 level)
2. Exécute le forward/backward en dense (code actuel)
3. Exécute le forward/backward en sparse (nouveau code)
4. Vérifie que les résultats sont identiques (tolérance 1e-10)

Cela garantit zéro régression. Ensuite on peut supprimer le code dense.

### 1.11 Risques

- **String keys "t:c"** dans les Maps : overhead GC pour ~35K strings × 16 heads. Alternative : `t * numCaps + c` (int key) ou Float64Array pré-allouée.
- **Backward correctness** : le gradient flow à travers softmax + attention doit être identique. Le test de régression est crucial.
- **L'orchestrator est utilisé par d'autres consumers** (autograd-trainer, benchmark) : il faut que la nouvelle API soit backward-compatible ou migrer tous les consumers.

---

## Partie 2 : Parquet pour le dataset

### 2.1 Problème actuel

Le dataset `bench-dataset-export.msgpack.gz` :
- 1.2 GB compressé
- Chargement : read file (1.2GB) → ungzip (4GB) → msgpack decode (5GB JS) = **peak ~10GB**
- Même avec staged loading (`null` buffers), le peak est ~6-7GB
- Chaque restart = 40s+ de chargement

### 2.2 Solution : Apache Parquet

| Feature | msgpack.gz | Parquet |
|---------|-----------|---------|
| Columnar access | Non (tout-ou-rien) | Oui (colonnes individuelles) |
| Type natif Float32 | Non (JSON numbers = Float64) | Oui (Float32 natif, ÷2 mémoire) |
| Compression | gzip global | Per-column snappy/zstd |
| Streaming | Non | Oui (row groups) |
| Random access | Non | Oui (row group offsets) |
| Ecosystème | JS natif | Arrow/Parquet libs |

### 2.3 Structure Parquet proposée

Un seul fichier `.parquet` avec row groups par type de données :

**Table `nodes`** :
| Colonne | Type | Notes |
|---------|------|-------|
| id | STRING | tool_id ou cap_id |
| embedding | FIXED_SIZE_LIST(FLOAT, 1024) | 1024 × Float32 = 4KB/row |
| children | LIST(STRING) | IDs des enfants |
| is_leaf | BOOL | leaf vs capability |

**Table `prod_examples`** :
| Colonne | Type |
|---------|------|
| intent_embedding | FIXED_SIZE_LIST(FLOAT, 1024) |
| context_tool_ids | LIST(STRING) |
| target_tool_id | STRING |
| is_terminal | INT8 |
| trace_id | STRING |

**Table `n8n_examples`** :
| Colonne | Type |
|---------|------|
| intent_embedding | FIXED_SIZE_LIST(FLOAT, 1024) |
| context_tool_ids | LIST(STRING) |
| target_tool_id | STRING |
| is_terminal | INT8 |
| soft_target_indices | LIST(INT32) |
| soft_target_probs | LIST(FLOAT) |

**Table `workflow_tool_lists`** :
| Colonne | Type |
|---------|------|
| tool_ids | LIST(STRING) |

### 2.4 Avantages concrets

1. **Lazy loading n8n** : si `--no-kl`, ne charge pas du tout `n8n_examples` → économie ~4GB
2. **Float32 natif** : embeddings 1024D × Float32 = 4KB/row au lieu de 8KB/row (Float64 JSON)
3. **Row groups** : charger par chunks de 1000 rows → peak mémoire constant
4. **Startup rapide** : metadata read + column seek → < 5s au lieu de 40s+
5. **Pas de gunzip** : Parquet compresse per-column avec snappy (~2x faster que gzip)

### 2.5 Estimation mémoire

| Composant | msgpack (actuel) | Parquet (cible) |
|-----------|-----------------|----------------|
| Nodes (8984 × 1024D) | ~73MB Float64 | ~37MB Float32 |
| Prod examples (1155 × 1024D) | ~9.4MB | ~4.7MB |
| N8n examples (35K × 1024D) | ~287MB Float64 | ~143MB Float32 |
| Soft targets sparse | ~50MB | ~25MB |
| **Total** | **~420MB** | **~210MB** |
| Peak loading | **~6-7GB** | **~250MB** |

### 2.6 Librairie Deno

```typescript
// Option A: apache-arrow (npm, fonctionne sous Deno)
import { tableFromIPC, tableToIPC } from "npm:apache-arrow@18";

// Option B: parquet-wasm (WASM, performant)
import { readParquet, writeParquet } from "npm:parquet-wasm@0.6";

// Option C: duckdb-wasm (heavy mais très flexible)
import * as duckdb from "npm:@duckdb/duckdb-wasm";
```

**Recommandation** : `parquet-wasm` — léger, WASM pur, lit/écrit Parquet directement. Pas besoin de DuckDB.

### 2.7 Plan d'implémentation

| # | Étape | Effort |
|---|-------|--------|
| 1 | `tools/export-dataset-parquet.ts` — export vers .parquet | 1h |
| 2 | Adapter `train-ob.ts` pour lire .parquet | 1h |
| 3 | Lazy loading : skip n8n si --no-kl | 15 min |
| 4 | Supprimer le code msgpack.gz | 15 min |
| **Total** | | **~2h30** |

### 2.8 Risques

- **parquet-wasm** : dépendance WASM sous Deno avec `--unstable-ffi` (potentiel conflit)
- **apache-arrow** : plus stable mais plus lourd (~10MB)
- **Encoding strings** : les tool IDs en LIST(STRING) utilisent du dictionary encoding automatiquement → efficace
- **Backward compat** : garder le msgpack loader comme fallback pendant la transition

---

## Partie 3 : Ordre d'implémentation

### Priorité 1 : Sparse MP (bloquant)

Sans sparse, pas de training avec la hiérarchie n8n. C'est le bloquant immédiat.

### Priorité 2 : Parquet (confort)

Le training peut fonctionner avec msgpack.gz + 12GB heap une fois que le MP est sparse (~54MB au lieu de ~7GB). Parquet est du confort (startup rapide, moins de RAM, lazy load).

### Séquence

```
[Sparse MP] ──► [Training KL avec hiérarchie] ──► [Résultats]
                         │
[Parquet export] ────────┘  (en parallèle, optionnel)
```

---

## Partie 4 : Résumé décisionnel

| Décision | Choix | Raison |
|----------|-------|--------|
| Sparse format | Adjacency lists (Map) | Simple, O(edges), JS natif |
| Clé attention | `t * maxCaps + c` (int) | Évite GC strings |
| Parquet lib | parquet-wasm | Léger, WASM, Deno-compatible |
| Migration strategy | Sparse MP d'abord, Parquet ensuite | MP est le bloquant |
| Backward compat | Tests dense ≡ sparse | Zéro régression |

---

## Partie 5 : Review Action Items (2026-02-13)

Revue effectuee apres completion des Tasks #1-#5 (rename + sparse migration + dW_source bug fix).

### 5.1 Compilation

- **PASS** : Les 5 fichiers MP principaux (VE, EV, EE, V2V, orchestrator) compilent sans erreurs.
- **FAIL** : `lib/shgat-tf/src/training/multi-level-trainer.ts:15` — import `SHGATConfig` inutilise (TS6196). Side-effect de la migration. **Action** : supprimer l'import inutilise.

### 5.2 Tests

- **42/42 PASS** dans `sparse-equivalence.test.ts` — couvre VE, EV, EE forward+backward, cas limites, verification finite differences.
- Le bug dW_source (matmulTranspose au lieu de matmul(transpose(...))) est documente comme fixe dans les tests (commentaires "matmulTranspose bug fixed").

### 5.3 Naming : Fichiers propres (IN SCOPE)

Les fichiers suivants sont **entierement migres** vers la nomenclature L0/L1 :

| Fichier | Statut |
|---------|--------|
| `vertex-to-edge-phase.ts` | CLEAN — numL0, numL1 |
| `edge-to-vertex-phase.ts` | CLEAN — numL0, numL1 |
| `edge-to-edge-phase.ts` | CLEAN — E_k, E_kPlus1, numSourceNodes/numTargetNodes |
| `phase-interface.ts` | CLEAN — SparseConnectivity generique source/target |
| `multi-level-orchestrator.ts` | CLEAN — l0ToL1Conn, interLevelConns, W_child/W_parent |
| `train-ob.ts` | CLEAN — l0Ids, l0IdxMap, capIdsByLevel |
| `sparse-equivalence.test.ts` | CLEAN — NUM_L0, NUM_L1 |
| `types.ts` (LevelParams) | CLEAN — W_child, W_parent, a_upward, a_downward |

### 5.4 Naming : Remnants stale (a corriger)

| Fichier | Ligne | Probleme | Fix |
|---------|-------|----------|-----|
| `tensor-forward.ts` | 291 | Commentaire `[numTools, numCaps]` | Remplacer par `[numL0, numL1]` |
| `mod.ts` | 7-10 | Commentaires module : "Tool-to-tool", "Tools -> Capabilities" | Remplacer par "L0-to-L0", "L0 -> L1+", "L1+ -> L0" |
| `mod.ts` | 41 | Export `getToolEmbeddings` depuis `cooccurrence-loader.ts` qui **n'existe pas** | Supprimer la ligne d'export morte |
| `vertex-to-vertex-phase.ts` | 156, 162 | Param `_toolIds` et JSDoc `@param _toolIds` | Renommer en `_l0Ids` |
| `vertex-to-vertex-phase.ts` | 573, 578 | `buildCooccurrenceMatrix()` param `toolIndex` + JSDoc "tool ID" | Renommer `toolIndex` -> `l0Index`, "tool ID" -> "L0 node ID" |
| `vertex-to-vertex-phase.ts` | 617-648 | `buildCooccurrenceFromWorkflows()` params `workflowToolLists`, `toolIndex`, var `tools`, commentaires "tool" | Renommer : `workflowNodeLists`, `l0Index`, `nodes`, "L0 node" |

**Impact** : Purement cosmetics (commentaires + noms de parametres dans les fonctions utilitaires V2V). Aucun impact fonctionnel.

### 5.5 Fichiers hors scope (old naming conservee)

Les fichiers suivants utilisent encore l'ancienne terminologie mais ne font **pas partie** du perimetre de cette migration :

- `src/core/shgat.ts`, `builder.ts`, `forward-helpers.ts`, `stats.ts` — inference runtime
- `src/training/autograd-trainer.ts` — legacy TF.js trainer (remplace par train-ob.ts)
- `tools/train-from-bench.ts` — ancien script de training benchmark

Ces fichiers devront etre migres dans un futur ticket de cleanup global.

### 5.6 Bug dW_source (pre-existant, FIXE)

Le bug etait dans le backward Step 6 des 3 phases VE/EV/EE :

```typescript
// BUG: dW_source = matmulTranspose(dH_proj, H) — calcule dH_proj @ H^T
// FIX: dW_source = matmul(transpose(dH_proj), H) — calcule dH_proj^T @ H
```

**Verifie** via finite differences (tolerance 1e-4) dans sparse-equivalence.test.ts. Les 42 tests passent.

### 5.7 Sparse migration : Validation

- `SparseConnectivity` interface bien definie dans `phase-interface.ts` avec `denseToSparse()` et `transposeSparse()` utilitaires.
- Les phases utilisent des cles entieres `edgeKey(s, t, numTargets) = s * numTargets + t` — pas de string GC (conforme a la decision du tech spec, section 4).
- L'orchestrator supporte les deux modes : dense (auto-converti via `denseToSparse()` pour backward compat) et sparse direct via `forwardMultiLevelWithCache()`.
- `train-ob.ts` construit directement du sparse via `buildGraphStructure()` — pas de conversion dense intermediaire.

### 5.8 Resume

| Critere | Resultat |
|---------|----------|
| Compilation MP files | PASS (sauf multi-level-trainer.ts import) |
| Tests sparse = dense | 42/42 PASS |
| Naming L0/L1 (phase files) | CLEAN |
| Naming L0/L1 (orchestrator) | CLEAN |
| Naming L0/L1 (train-ob) | CLEAN |
| Naming stale (comments) | 6 occurrences mineures (section 5.4) |
| dW_source bug | FIXE + verifie |
| Sparse memory reduction | ~130x (107MB dense -> 0.6MB sparse) |
