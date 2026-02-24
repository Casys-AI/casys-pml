# Audit SHGAT Enrichment : Trouvailles et Améliorations

**Date** : 2026-02-24
**Contexte** : Analyse approfondie du pipeline d'enrichissement SHGAT (qui alimente le GRU en embeddings), suite aux benchmarks frais (SHGAT 53.1% vs NO_SHGAT 52.6% Hit@1)
**Suite de** : `2026-02-24-shgat-gru-pipeline-state.md`

**IMPORTANT** : Cet audit concerne le **SHGAT** (enrichissement des embeddings tools), PAS le GRU lui-même. Le GRU est le même dans tous les cas (`train-worker-prod.ts`). Ce qui change c'est la qualité des embeddings qu'il reçoit en entrée.

---

## 1. Résumé exécutif

Trouvailles dans le pipeline **SHGAT enrichment** (en amont du GRU) :

| # | Trouvaille | Concerne | Impact | Priorité |
|---|-----------|----------|--------|----------|
| F1 | V2V co-occurrence absente du **script de benchmark** (mais présente en prod) | SHGAT enrichment | Les benchmarks sous-estiment l'effet SHGAT | **P0** |
| F2 | L2 caps silencieusement ignorées dans le **graph SHGAT** (children = noms de caps L1, pas de tools) | SHGAT graph | Hiérarchie multi-niveaux jamais exercée dans le graph SHGAT | P2 |
| F3 | La tech-spec 2026-02-24 section 4.3 dit "V→E→V + V2V" — faux pour le script standalone | Doc | Doc incorrecte | P1 |
| F4 | Deux chemins d'enrichissement SHGAT divergents (prod vs script) | SHGAT enrichment | Le script de benchmark ne reproduit pas les conditions prod | **P0** |

**Note** : Le GRU n'est pas affecté directement — il reçoit des `toolEmbeddings` pré-enrichis et ne sait pas d'où ils viennent. Les L1/L2 dans le GRU arrivent via les `task_results`, pas via le graph SHGAT.

---

## 2. F1 — Deux pipelines GRU, un seul avec V2V

### Constat

Il existe **deux** chemins de training GRU, qui ne font PAS la même chose :

| Aspect | Prod live (`post-execution.service.ts:515`) | Script standalone (`scripts/train-gru-with-caps.ts`) |
|--------|----------------------------------------------|-----------------------------------------------------|
| Déclenché par | Chaque exécution (chaîné après SHGAT) | Manuel (`deno run -A`) |
| Embeddings tools | `shgat.getToolEmbeddings()` = **V2V + MP enrichi** | `SHGATAdapter.enrichEmbeddings()` = **MP hiérarchique seul** |
| V2V co-occurrence | **OUI** — `withCooccurrence: true` (initializer.ts:163) | **NON** — l'adapter n'appelle pas v2v.ts |
| Traces | LIMIT 200 récentes | Toutes les traces DB |
| Caps dans vocab | Oui, capabilityData passé au worker | Oui, capabilityData passé au worker |
| Warm start | Poids DB existants | Poids DB existants |

**Conséquence** : les benchmarks frais (SHGAT 53.1% vs NO_SHGAT 52.6%) mesurent le MP hiérarchique seul (sans V2V). Le gain réel du SHGAT en prod est potentiellement plus élevé car V2V y est incluse.

### Notebook 10 — analysait V2V isolément

Le notebook 10 (`10-shgat-impact-analysis.ipynb`) a reconstruit et analysé l'enrichissement **V2V co-occurrence** :
- 168/168 caps ont amélioré leur intra-similarity
- Co-cap 5-NN rate doublé : 24% → 43%
- 74 tools améliorés, 0 dégradés

**Ce signal V2V est présent en prod** (via `shgat.getToolEmbeddings()`) mais **absent du script de benchmark**.

### Preuve de la divergence

**Script standalone** (`train-gru-with-caps.ts`) :
```typescript
// L153-181 : seul enrichissement = adapter.enrichEmbeddings()
const adapter = new SHGATAdapter();
adapter.setParams(SHGATAdapter.convertAutogradToOB(loadedRaw));
const { l0Embeddings } = adapter.enrichEmbeddings(); // MP hiérarchique seulement
```

`SHGATAdapter.enrichEmbeddings()` (`lib/shgat-for-gru/src/adapter.ts:383-559`) implémente uniquement V→E→V. Zéro référence à V2V/co-occurrence dans adapter.ts.

Le code V2V **existe** dans `lib/shgat-for-gru/src/v2v.ts` (exporté, 12 tests, utilisé par `train-paper-mp.ts`) mais n'est **jamais appelé** par le script standalone.

**Prod live** (`post-execution.service.ts:629-646`) :
```typescript
// L639-644 : utilise la prod SHGAT (V2V + MP)
const shgat = this.deps.shgat;
const shgatEmbs = shgat.getToolEmbeddings(); // → forward() lazy → V2V + MP enrichi
```

V2V activée via `withCooccurrence: true` dans `initializer.ts:163`, chargée par `algorithm-factory.ts:224`.

### Impact sur les benchmarks

| Aspect | Ce que les benchmarks mesurent | Ce que la prod fait |
|--------|-------------------------------|---------------------|
| SHGAT enrichment | MP hiérarchique seul | V2V + MP hiérarchique |
| Hit@1 mesuré | 53.1% (vs 52.6% raw) | Inconnu (potentiellement meilleur) |
| Traces | Toutes (1716) | 200 récentes |

### Fix proposé

**Option A (rapide)** : Ajouter V2V au script standalone pour aligner avec la prod :

```typescript
// Dans train-gru-with-caps.ts, APRÈS build graph, AVANT enrichEmbeddings()
import { buildCooccurrenceFromWorkflows, v2vEnrich } from "../lib/shgat-for-gru/src/v2v.ts";

const workflowToolLists = capabilityData
  .filter(c => c.toolChildren.length >= 2)
  .map(c => c.toolChildren.filter(t => toolVocab.has(t)));
const toolIdToIdx = new Map<string, number>();
Object.keys(toolEmbeddings).forEach((id, i) => toolIdToIdx.set(id, i));
const cooccurrence = buildCooccurrenceFromWorkflows(workflowToolLists, toolIdToIdx);
const toolIds = Object.keys(toolEmbeddings);
const H_raw = toolIds.map(id => toolEmbeddings[id]);
const H_v2v = v2vEnrich(H_raw, cooccurrence, { residualWeight: 0.3 });
toolIds.forEach((id, i) => { toolEmbeddings[id] = H_v2v[i]; });
```

**Option B (propre)** : Intégrer V2V dans `SHGATAdapter.enrichEmbeddings()` pour un seul code path.

### Effort estimé : ~30min (option A) / ~2h (option B)

---

## 3. F2 — L2 caps ignorées dans le graph SHGAT (PAS dans le GRU)

### Constat

**Scope** : ceci concerne le graph SHGAT (enrichissement embeddings), PAS le GRU. Le GRU reçoit ses séquences depuis `task_results` et n'est pas affecté par ce skip.

Les 10 caps L2 sont supprimées du **graph SHGAT** car leurs `tools_used` contiennent des **noms de caps L1**, pas des tool IDs :

```
L2 cap: code:exec_abc123
  tools_used: ["code:exec_xyz789"]  ← c'est une cap L1, pas un tool

L1 cap: code:exec_xyz789
  tools_used: ["std:psql_query", "std:exec_sql"]  ← vrais tools
```

**Vérification DB** :
- 10 L2 caps, chacune avec 1 child dans `tools_used`
- 0/9 children L2 existent dans `tool_embedding`
- 9/9 children L2 sont IS_A_CAP (ce sont des noms de caps L1)

Le code qui filtre (`train-gru-with-caps.ts:171`) :

```typescript
const validChildren = cap.toolChildren.filter(c => toolVocab.has(c));
if (validChildren.length === 0) continue;  // ← L2 SUPPRIMÉE SILENCIEUSEMENT
```

**Résultat** : le graph SHGAT est plat — `Graph: 918 L0, L0:598 higher`. Un seul niveau de caps. Le message passing multi-niveaux (E^0→E^1→...→E^L) **n'est jamais exercé**.

### Impact

Marginal. 10 caps sur 662, chacune ne contenant qu'un seul child. Même avec le fix, l'impact sur le training serait minimal. À corriger pour la complétude mais pas urgent.

### Fix proposé (P2)

Résoudre les children L2 transitivement vers les tools L0 :

```typescript
// Pour les caps L2+, résoudre via capChildrenMap
for (const cap of capabilityData) {
  if (cap.level >= 2) {
    const resolvedTools = new Set<string>();
    const queue = [...cap.toolChildren];
    while (queue.length > 0) {
      const child = queue.shift()!;
      if (toolVocab.has(child)) {
        resolvedTools.add(child);
      } else {
        // child est une cap → expand ses propres children
        const grandChildren = capChildrenMap.get(child);
        if (grandChildren) queue.push(...grandChildren);
      }
    }
    cap.toolChildren = [...resolvedTools];
  }
}
```

### Note : ce n'est PAS un silent fallback

C'est un `continue` (skip), pas un fallback dégradé. Le tool est simplement exclu du graph. Ce n'est pas idéal mais pas dangereux non plus — c'est du dead weight en moins. Un `log.warn()` serait approprié.

---

## 4. F3 — Erreur dans la tech-spec existante

### Section 4.3 (ligne 214)

**Dit** : "Enrichit les embeddings via SHGATAdapter (message passing V→E→V + V2V)"

**Réalité** : V→E→V uniquement, pas de V2V.

### Section 5.1 — Benchmarks obsolètes

Les benchmarks datent du 2026-02-23 (avant le fix data quality). Les résultats frais (2026-02-24) sont :

| Config | Hit@1 | Term Acc | Notes |
|--------|-------|----------|-------|
| NO_SHGAT (raw BGE-M3) | 52.6% (best ep26), 41.3% (ep50) | 85.8% | Overfitting sévère |
| SHGAT (MP hiérarchique seul) | 53.1% (best ep48), 49.1% (ep50) | 86.8% | Meilleure généralisation |

**Changement vs section 5.1** : SHGAT ne dégrade PLUS Hit@1 (-9pp → +0.5pp). La dégradation historique était due à des données corrompues (FQDN), pas à l'algorithme.

### Section 6.4 — "Les code:exec_* — pas du bruit"

Correct. Mais noter que 0/667 caps existent dans `tool_embedding`. Les caps sont **uniquement** dans `workflow_pattern.intent_embedding`. Deux espaces d'embedding différents.

---

## 5. Analyse hiérarchique L1/L2

### L1 : fonctionnel mais plat

- 598 caps L1 participent au graph SHGAT (sur 649 totales — 51 filtrées car 0 children dans le vocab)
- Chaque L1 agrège ses tools children (upward pass), puis re-propage (downward pass)
- Effet mesuré : +0.5pp Hit@1 via MP hiérarchique seul
- L'enrichissement est réel mais faible comparé à V2V

### L2 : non exercé

- 10 caps L2 existent en DB
- 0 participent au graph SHGAT (children = noms de caps)
- Le code multi-niveaux (E^0→E^1→...→E^L_max) dans `MultiLevelOrchestrator` et `SHGATAdapter` n'est jamais activé pour level > 0
- Impact : quasi nul (10 caps, 1 child chacune)

### Observations analytiques (notebook 10)

Sur les embeddings V2V-enrichis (mesure hors pipeline GRU, mais représentatif du signal V2V) :

| Métrique | Raw BGE-M3 | V2V-enrichi | Delta |
|----------|-----------|-------------|-------|
| Intra-cap cosine similarity (mean) | ~0.34 | ~0.41 | **+0.07** |
| Inter-cap centroid similarity (mean) | ~0.28 | ~0.30 | +0.02 (léger) |
| 5-NN co-cap rate | 24% | 43% | **+19pp** |
| Caps améliorées / dégradées | - | 168 / 0 | 100% améliorées |
| Tools améliorés / dégradés | - | 74 / 0 | 100% améliorés |

### Point faible identifié

La séparation inter-cap augmente légèrement (+0.02 cosine). L'enrichissement V2V rapproche les co-cap tools mais ne pousse pas les non-co-cap tools plus loin. Un contrastive loss (InfoNCE) lors du training SHGAT pourrait améliorer ça. Priorité : P2 (les gains intra-cap sont déjà forts).

---

## 6. Recommandations ordonnées

### P0 : Aligner le script de benchmark avec la prod (~30min)

Ajouter V2V au script standalone `train-gru-with-caps.ts` pour que les benchmarks reflètent le comportement prod. Le code V2V est prêt dans `lib/shgat-for-gru/src/v2v.ts`.

**Validation** : 3 benchmarks parallèles — raw, MP seul (actuel), V2V+MP (aligné prod).

### P1 : Corriger la tech-spec existante (~10min)

- Section 4.3 : "V→E→V + V2V" → "V→E→V seul (V2V absente du script standalone)"
- Section 5.1 : Benchmarks obsolètes (-9pp) → résultats frais (+0.5pp MP seul)

### P2 : Résoudre children L2 transitivement (~1h)

Pour la complétude. Impact attendu minimal (10 caps, 1 child chacune) mais corrige un silent skip.

### P3 : Contrastive loss pour séparation inter-cap (~2j)

Gain potentiel sur la séparation des embeddings entre caps non liées. Plus long terme.

---

## 7. Réponses aux questions ouvertes

1. **V2V en prod ?** **OUI.** `initializer.ts:163` passe `withCooccurrence: true` → `algorithm-factory.ts:224` charge `loadCooccurrenceData()` → `shgat.setCooccurrenceData()`. Le `forward()` lazy inclut V2V puis MP.

2. **Quel training GRU en prod ?** `post-execution.service.ts:runGRUBatchTraining()` (ligne 515), déclenché après chaque exécution. Utilise `shgat.getToolEmbeddings()` = embeddings V2V+MP enrichis.

3. **Embeddings de caps ?** Les caps utilisent `workflow_pattern.intent_embedding` (PAS `tool_embedding`). 0/667 caps dans `tool_embedding`. Les cap embeddings servent d'embedding initial des hyperedges dans le graph SHGAT — ils sont intermédiaires, pas dans la sortie finale. Pour le GRU, les cap embeddings arrivent via `capabilityData` passé au worker, qui les utilise pour le vocab (similarity_head) et le toolCapMap (input features).

4. **V2V avant ou après MP ?** La prod fait V2V d'abord (`MultiLevelOrchestrator.forwardMultiLevel()` ligne 347 : `applyV2VEnrichment` AVANT upward pass). Le script standalone devrait faire pareil.

---

*Prochaine étape : aligner le script de benchmark (P0) et re-benchmarker avec V2V+MP.*
