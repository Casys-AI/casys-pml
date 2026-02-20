# Audit : Edges manquantes dans le Message Passing + Architecture complète

**Date** : 2026-02-16
**Statut** : Constat critique + proposition d'architecture
**Impact** : Le MP n'exploite que ~20% de l'information de graphe disponible

---

## Partie 1 — Constat

Le système produit et stocke 4 types d'edges pondérées (ADR-041, ADR-050) :

| Edge type | Poids | Signification | Source |
|---|---|---|---|
| `dependency` | 1.0 | DAG explicite (templates) | `static-structure-builder.ts` |
| `contains` | 0.8 | Hiérarchie capability → tool | `hypergraph-builder.ts` |
| `provides` | 0.7 | Data flow : sortie de A alimente entrée de B (schema matching) | `provides-edge-calculator.ts` |
| `sequence` | 0.5 | Ordre temporel entre siblings | `edge-generators.ts` |

Chaque edge a un niveau de confiance (`observed` ×1.0, `inferred` ×0.7, `template` ×0.5) et un compteur d'observations. Le tout est stocké dans `graph-store.ts` (graphology) et `tool_dependency` (PostgreSQL).

**Aucune implémentation de Message Passing n'utilise autre chose que `contains`.**

### Ce que chaque MP reçoit

| Implémentation | Input | `contains` | `provides` | `sequence` | Workflows n8n |
|---|---|---|---|---|---|
| Production SHGAT (`src/graphrag/algorithms/shgat.ts:332`) | `{ tools, capabilities }` | Oui | **Non** | **Non** | **Non** |
| SHGAT-TF (`lib/shgat-tf/src/graph/graph-builder.ts`) | `GraphBuildData` | Oui | **Non** | **Non** | **Non** |
| PaperMP (`lib/shgat-for-gru/src/paper-mp.ts`) | `GraphNode[]` | Oui | **Non** | **Non** | **Non** |
| V→V (`lib/shgat-for-gru/src/v2v.ts`) | `CooccurrenceEntry[]` | Non | **Non** | **Non** | Partiel (pairwise) |

### Ce qu'on perd

**1. Edges `provides` (data flow)** — `provides-edge-calculator.ts` (Story 10.3)
- Matching champ-par-champ (nom + type), 3 niveaux de couverture (strict/partial/optional)
- Signal le plus fort : compatibilité fonctionnelle prouvée par les schémas
- Stocké en DB (`tool_dependency`), utilisé par Dijkstra (suggestions) — **jamais par le MP**

**2. Edges `sequence` (ordre temporel)** — `edge-generators.ts`
- Chaînage de méthodes (`chainedFrom`) + ordre d'exécution observé
- **Jamais dans le MP**

**3. Workflows n8n comme hyperedges** — 7654 workflows scrapés
- Chaque workflow = séquence ordonnée de 3-10+ tools
- Utilisés par le GRU (training) et V→V (co-occurrence pairwise)
- **Jamais comme hyperedges dans le MP**

**4. Le problème des orphelins** — 1065/1932 tools (55%) sans parent capability
- Le MP ne les touche pas → deux populations d'embeddings (enrichis vs raw)

### Chronologie des panels experts

| Date | Panel | Aurait dû voir | A dit |
|---|---|---|---|
| 2026-02-09 | Residual spike vs hier collapse | Graphe incomplet | Focus residual alpha |
| 2026-02-14 | MCP On-Demand | Idem | Focus archi distribuée |
| 2026-02-16 | Hit@1 roadmap v1 | Idem | "DAG fix = causal ancestors pour GRU" (mauvais endroit) |
| 2026-02-16 | Hit@1 roadmap v3 | Idem | "Pivoter vers V→V si MP échoue" (sans graphe complet) |

### Impact sur les benchmarks passés

| Benchmark | Résultat | Graphe utilisé |
|---|---|---|
| SHGAT-TF OB Run 7 (2026-02-14) | R@1=24.3% | contains only |
| SHGAT_RANDOM (2026-02-16) | Hit@1=65.5% (GRU downstream) | contains only |
| NO_SHGAT (2026-02-16) | Hit@1=69.0% (GRU downstream) | aucun MP |
| LiveMCPBench Option B (2026-02-09) | R@1=16.4% | contains only |

La conclusion "le MP random dégrade" (−3.5pp) n'a **jamais** été testée avec le graphe complet.

---

## Partie 2 — Données disponibles

| Source | Format | Count | Ordonné? | Localisation |
|---|---|---|---|---|
| Capabilities | `GraphNode[]` (parent→children) | ~226 | Non | Construit à la volée dans benchmark |
| N8N workflows | `{intentEmbedding, positiveToolIds[]}` | ~30K pairs (~7654 wf uniques) | Oui (via `buildNodeSequence()`) | `lib/gru/data/n8n-shgat-contrastive-pairs.json` (167MB) |
| Provides edges | `(from, to, confidence, coverage, fieldMapping)` | Sparse, en DB | Dirigé A→B | `tool_dependency` table, `edge_type='provides'` |
| Sequence edges | `(from, to, observed_count)` | En DB | Dirigé A→B | `tool_dependency` table, `edge_type='sequence'` |
| Co-occurrence V→V | pairwise weighted | ~103K | Non | Construit depuis n8n pairs dans benchmark |

### Structure clé : `tool_dependency` (PostgreSQL)

```sql
CREATE TABLE tool_dependency (
  from_tool_id TEXT NOT NULL,
  to_tool_id TEXT NOT NULL,
  confidence_score REAL DEFAULT 0.5,
  edge_type TEXT DEFAULT 'sequence',      -- 'provides' | 'sequence' | 'dependency'
  edge_source TEXT DEFAULT 'inferred',    -- 'observed' | 'inferred' | 'template'
  observed_count INTEGER DEFAULT 1,
  PRIMARY KEY (from_tool_id, to_tool_id)
);
```

### Structure clé : N8N contrastive pairs

```typescript
interface ShgatContrastivePair {
  intentEmbedding: number[];      // 1024D BGE-M3 (description du workflow)
  positiveToolIds: string[];      // MCP tools mappés (NON ordonné dans le JSON)
  workflowId: number;
  workflowName: string;
}
```

L'ordre séquentiel existe dans `n8n-workflows.json` via les `edges[]` et est reconstituable par `buildNodeSequence()` (tri topologique de Kahn).

---

## Partie 3 — Architecture proposée : pipeline V→V + V↔E

### Vue d'ensemble

```
Raw BGE-M3 embeddings (1932 tools × 1024D)
         │
    ┌────▼────┐
    │  V→V    │  provides (schema) + sequence (observé) + co-occurrence (n8n)
    │  phase  │  Edges pairwise pondérées par type × source
    └────┬────┘
         │  H_v2v = enriched tool embeddings
    ┌────▼────┐
    │  V↔E    │  capabilities (~226) + workflows (~7654) comme hyperedges L1
    │ PaperMP │  Two-phase attention (V→E, E→V), shared W, W₁
    └────┬────┘
         │  H_enriched = final tool embeddings
         ▼
    GRU training (séquences, 33K exemples)
```

### Pourquoi séparer V→V et V↔E ?

Ce sont deux types de relations fondamentalement différents :

- **V→V** = "tool A se connecte à tool B" (pairwise, dirigé, data flow)
- **V↔E** = "ces N tools forment un ensemble" (groupe, non-dirigé, membership)

Forcer des edges pairwise dirigées dans le hypergraphe comme des hyperedges à 2 nœuds serait dégénéré : le MP sur {A, B} c'est juste mixer deux embeddings avec un residual.

### V→V phase — enrichir `v2v.ts`

Aujourd'hui `v2v.ts` traite uniquement la co-occurrence (poids uniforme). On l'enrichit avec les edges typées et pondérées :

```
final_weight = type_weight × source_modifier

provides × observed   = 0.7 × 1.0 = 0.70  (le plus fort — schema prouvé)
provides × inferred   = 0.7 × 0.7 = 0.49
sequence × observed   = 0.5 × 1.0 = 0.50
sequence × inferred   = 0.5 × 0.7 = 0.35
co-occurrence (n8n)   = frequency-based     (volume massif, signal plus faible)
```

Sources d'edges V→V :
1. `tool_dependency` table (provides + sequence, production)
2. Co-occurrence n8n (existant dans benchmark)
3. Sequence edges EXTRAITES des workflows n8n (A→B→C dans un workflow = edges A→B, B→C, via `buildNodeSequence()`)

Le V→V fait une aggregation attention-weighted des voisins, chaque edge pondérée par son type et sa confiance.

### V↔E phase — enrichir le graphe PaperMP

`buildGraph()` reçoit deux types de nœuds L1 :

```typescript
// Capabilities (existant, ~226)
{ id: "cap:email_tools", embedding: capEmb, children: ["std.gmail_send", "std.outlook_send"], level: 0 }

// Workflows n8n (nouveau, ~7654 après filtrage)
{ id: "n8n:wf:12345", embedding: wfDescEmb, children: ["std.sheets_read", "std.gmail_send", "std.slack_notify"], level: 0 }
```

**L'API `GraphNode` ne change pas.** Les workflows sont des `GraphNode[]` identiques aux capabilities. Le PaperMP les traite uniformément — W et W₁ restent partagés.

Les workflow embeddings existent déjà : champ `intentEmbedding` dans les contrastive pairs = embedding BGE-M3 de la description du workflow.

### Impact sur les orphelins

| | Avant (contains only) | Après (contains + workflows) |
|---|---|---|
| Tools connectés à ≥1 hyperedge | 867 (45%) | Estimation >1600 (>80%) |
| Hyperedges L1 | ~226 | ~226 + ~7654 = ~7880 |
| Params PaperMP | 525K (2 × 256 × 1024) | 525K (inchangé) |

### Filtrage des workflows

Les 30K pairs incluent du bruit. Critères de filtrage proposés :
- **Minimum 3 tools** par workflow (les paires sont déjà dans le V→V)
- **Maximum 20 tools** (les workflows géants sont probablement des mega-templates)
- **Minimum 2 tools mappés dans notre vocab** (sinon le workflow est invisible pour le MP)
- On prend les **workflows uniques** (~7654) plutôt que les 30K pairs (qui incluent des doublons)

---

## Partie 4 — Training PaperMP (InfoNCE + KL)

### Contexte : ce qui a été décidé

Le roadmap (`lib/gru/docs/2026-02-16-roadmap-hit-at-1-improvements.md`) et le doc InfoNCE (`lib/shgat-tf/docs/2026-02-15-unified-infonce-n8n-hard-targets.md`) convergent sur :

1. **Drop SHGAT-TF** (7.35M params, overfit ep 3-4, archi incompatible PaperMP)
2. **Entraîner PaperMP directement** (525K params, ratio 16 params/ex sur 33K)
3. **InfoNCE sur tous les exemples** (prod + n8n) — loss unifiée
4. **KL comme régularisateur** sur le subset n8n — garde le gradient dense

### Ce qui existe déjà

| Brique | Statut | Fichier |
|---|---|---|
| Forward pass PaperMP | **DONE** | `paper-mp.ts:enrich()` |
| Forward avec cache | **DONE** | `paper-mp.ts:enrichWithCache()` |
| Backward pass (dW, dW1) | **DONE** | `paper-mp.ts:backward()` |
| Gradient numérique validation | **DONE** | `paper-mp.test.ts` (26/26 tests PASS) |
| Training script | **TODO** | `train-paper-mp.ts` (à créer) |
| Intégration benchmark | **PARTIEL** | Mode `SHGAT_PAPER` dans `benchmark-e2e.ts` (random only) |

### Architecture du training (à implémenter)

```
Pour chaque batch :
  1. Forward PaperMP (enrichWithCache)
     → H_enriched (tool embeddings enrichis par V→V + V↔E)
     → cache (pour backward)

  2. Compute losses :
     a. InfoNCE sur l'embedding enrichi du tool cible vs négatifs
        - Prod examples (1155 × 3 oversample) : hard targets (1 correct)
        - N8N examples (~30K) : hard targets argmax (seuil cosine ≥ 0.80)
        - Temperature τ = 0.07 (standard InfoNCE)

     b. KL divergence (régularisateur, n8n subset)
        - Soft targets (distribution cosine sim, T=0.005)
        - Poids KL: ~0.2 (prouvé +2.8pp R@1 dans train-ob.ts)
        - Gradient dense (10-20 tools par exemple) vs InfoNCE sparse (1 tool)

  3. Backward :
     - dH_enriched = gradient de la loss combinée sur les embeddings enrichis
     - PaperMP.backward(cache, dH) → dW, dW1

  4. Adam update (W, W1)
     - LR = 0.001 (validé pour ~33K exemples, cf. LR scaling note)
     - Warmup 2 epochs, cosine decay
     - Gradient clipping (max norm 1.0)
```

### Décisions training déjà prises (roadmap 2026-02-16)

| Décision | Valeur | Justification |
|---|---|---|
| Loss principale | InfoNCE (tous les 33K exemples) | Unification prod + n8n |
| Loss auxiliaire | KL sur n8n (poids ~0.2) | Gradient dense, prouvé +2.8pp |
| Label smoothing n8n | Top-3 [0.7, 0.2, 0.1] | PAS de hard argmax strict (avg top-1 sim = 0.796) |
| Seuil cosine n8n | ≥ 0.80 (relevé de 0.70) | Coupe les mappings bruités |
| Oversample prod | 3× | Contrebalance le volume n8n |
| Epochs max | 10 + early stopping sur prod test | Ratio 16 params/ex = risque overfit faible mais non nul |
| LR | 0.001 | Validé SHGAT-TF sur volumes similaires |
| Residual α | 0.9 (relevé de 0.3) | Panel v3 : 0.3 = trop agressif, préserver 90% de l'original |

### Red flags identifiés (panels v3, à surveiller)

1. **Le MP clusterise, le GRU a besoin de discriminer** — le MP moyennage pondéré de siblings → homogénéise intra-capability. Solution : α=0.9 préserve la spécificité.
2. **Dual population** — tools enrichis vs orphelins. Solution : les workflows réduisent massivement les orphelins (45% → >80% connectés).
3. **Gradient prod sparse sur le MP** — si les targets prod sont majoritairement orphelins, le MP reçoit peu de gradient direct. Solution : les workflows connectent les orphelins → plus de gradient.

### Code à récupérer de train-ob.ts (SHGAT-TF legacy)

| Optimisation | Source | Impact |
|---|---|---|
| Batched forward/backward KL | `train-ob.ts` | 3.7× speedup (matmulTranspose vs matVec/batch) |
| In-place gradient clipping | `adam-optimizer.ts` | Stabilité training |
| KL batch size 128, grad accum 4 | `train-ob.ts` | Mémoire contrôlée |
| Seed support (mulberry32) | `train-ob.ts` | Reproductibilité |
| InfoNCE loss computation | `train-ob.ts` | Pattern éprouvé |

---

## Partie 5 — Plan d'exécution

### Étape 1 : Enrichir le V→V (1 jour)

**Fichiers** : `v2v.ts`, `types.ts`

- Enrichir `CooccurrenceEntry` avec `edgeType?: string` et `weight?: number`
- Charger les edges `provides` et `sequence` depuis `tool_dependency` (query SQL)
- Extraire les sequence edges depuis les workflows n8n ordonnés
- Combiner les 3 sources avec leurs poids respectifs
- Appliquer le V→V enrichi dans le benchmark

### Étape 2 : Workflows comme hyperedges (0.5 jour)

**Fichiers** : `benchmark-e2e.ts`

- Les contrastive pairs sont déjà chargées (lignes 273-282)
- Créer des `GraphNode` pour chaque workflow unique (id=`n8n:wf:${wfId}`, embedding=`intentEmbedding`, children=`positiveToolIds`)
- Les passer à `buildGraph()` aux côtés des capabilities
- Pas de changement dans `paper-mp.ts` — l'API accepte déjà ce format

### Étape 3 : Training script `train-paper-mp.ts` (2 jours)

**Fichier** : `lib/shgat-for-gru/src/train-paper-mp.ts` (nouveau)

- Charger embeddings + graphe enrichi (capabilities + workflows)
- Charger training data (prod + n8n, 33K exemples)
- Forward avec cache → backward → Adam
- InfoNCE + KL comme décrit en Partie 4
- Early stopping sur prod test
- Sauvegarder params (W, W1) en JSON
- Récupérer les optimisations de `train-ob.ts`

### Étape 4 : Benchmark avec graphe complet (0.5 jour)

**Fichier** : `benchmark-e2e.ts`

- Mode `SHGAT_PAPER_TRAINED` : charger les params W, W1 entraînés
- Comparer :
  - NO_SHGAT = 69.0% (baseline à battre)
  - SHGAT_PAPER random + graphe complet (mesure l'effet du graphe enrichi seul)
  - SHGAT_PAPER trained + graphe complet (mesure l'effet du training)

---

## Fichiers concernés (résumé)

### Sources d'edges (existent, production)
- `src/graphrag/provides-edge-calculator.ts` — edges `provides` (schema matching)
- `src/capabilities/static-structure/edge-generators.ts` — edges `sequence`
- `src/graphrag/algorithms/edge-weights.ts` — poids par type × source
- `src/graphrag/core/graph-store.ts` — stockage graphology
- DB table `tool_dependency` — edges persistées avec confiance

### Données n8n (existent, gitignored)
- `lib/gru/data/n8n-shgat-contrastive-pairs.json` — workflows avec `positiveToolIds` + embeddings
- `lib/gru/data/n8n-workflows.json` — workflows raw avec edges ordonnées
- `lib/gru/data/n8n-training-examples.msgpack.gz` — séquences complètes

### MP à modifier
- `lib/shgat-for-gru/src/v2v.ts` — accepter edges typées et pondérées
- `lib/shgat-for-gru/src/types.ts` — enrichir `CooccurrenceEntry` avec edge metadata
- `lib/gru/src/benchmark-e2e.ts` — construire workflow hyperedges, charger provides/sequence, passer au graphe

### Training à créer
- `lib/shgat-for-gru/src/train-paper-mp.ts` — boucle InfoNCE + KL + Adam (backward existe)

### Documents de référence
- `lib/gru/docs/2026-02-16-roadmap-hit-at-1-improvements.md` — décisions panel v3
- `lib/shgat-tf/docs/2026-02-15-unified-infonce-n8n-hard-targets.md` — unification InfoNCE
- `lib/shgat-for-gru/src/__tests__/paper-mp.test.ts` — 26/26 tests backward PASS
