# Benchmark E2E — 2026-02-10

## Resultats (seed=42, n8n v1 = 2465 exemples, n8n-weight=0.3)

| Metrique | Valeur |
|---|---|
| Hit@1 / Hit@3 / MRR | 64.9% / 81.9% / 0.743 |
| E2E greedy exact (oracle 1st tool) | 35.7% (28 traces) |
| E2E beam@3 exact (oracle 1st tool) | 39.3% |
| Training | 2592 mixed (1125 prod 3x + 1467 n8n train) |

### True E2E (SHGAT picks first tool)
| Metrique | Valeur |
|---|---|
| SHGAT first tool @1 | 17.9% |
| SHGAT first tool @3 | 25.0% |
| Greedy exact | 0.0% |
| Beam@3 exact | 7.1% |

### n8n Generalization (held-out)
| Metrique | Valeur |
|---|---|
| n8n eval examples | 998 (27 workflows) |
| n8n next-tool @1 | 15.5% |
| n8n next-tool @3 | 29.3% |
| n8n termination | 36.0% |
| n8n workflow E2E exact | 0/27 (0%) |
| Synthetic intent coverage | 5/8 (>=50% tool match) |

## Key Finding: GRU-first > SHGAT-first

Le SHGAT optimise la similarite semantique globale a l'intent, pas le premier outil de la sequence.
- "Read deno.json and hash" → SHGAT pousse `hash_checksum` en #1, mais le 1er outil logique = `read_file`
- Le GRU avec contexte vide apprend quels outils DEMARRENT les sequences

**Pipeline prod recommandee**:
1. SHGAT → cherche une **capability existante** qui matche l'intent
2. Si match → executer directement (pas besoin du GRU)
3. Si pas de match → GRU(ctx=[]) → 1er outil, GRU(iteration) → suite
4. Enregistrer la nouvelle sequence comme capability pour la prochaine fois

SHGAT et GRU sont complementaires:
- SHGAT = retrieval de capabilities connues (court-circuit)
- GRU = composition de nouvelles sequences (exploration)

### Resultats 3 modes (seed=42, 2798 n8n, 30 test traces)

| Mode | 1st@1 | 1st@3 | Greedy | First-N | Beam@3 |
|---|---|---|---|---|---|
| SHGAT-first | 16.7% | 30.0% | 3.3% | 13.3% | 6.7% |
| **GRU-first** | **70.0%** | **86.7%** | **36.7%** | **43.3%** | 23.3% |
| Multi-start | 13.3% | 73.3% | 3.3% | 13.3% | 3.3% |

GRU-first ecrase SHGAT-first pour le choix du 1er outil (70% vs 16.7%).
Multi-start decevant — le beam scoring favorise les paths courts au lieu du bon path.

**Methodes ajoutees dans gru-model.ts**:
- `buildPathAutoStart()` — GRU choisit le 1er outil (ctx=[])
- `buildPathBeamMultiStart()` — lance K beams depuis les top-K premiers outils du GRU

**Step 9b benchmark modifie** pour comparer 3 modes: SHGAT-first, GRU-first, Multi-start.
→ PAS ENCORE RUN avec les 3 modes (benchmark interrompu, voir blockers)

## Blocker: n8n dataset v2 trop gros pour Deno

**Scrape v2**: 7654 workflows, 103213 edges, 811 node types
**Embeddings**: 2114 types, 44.2 MB
**Soft targets**: 30141 exemples

### Probleme
Le fichier `n8n-training-examples.json` fait ~1 GB (meme en sparse: 970 MB).
- V8 string limit ~1 GB → `Deno.readTextFile()` + `JSON.parse()` crash silencieusement
- `--v8-flags=--max-old-space-size=8192` ne resout pas (limite string, pas heap)
- Format sparse reduit de 1045 MB → 970 MB seulement (avg 420/644 entries non-nulles avec T=0.005)

### Cause racine
Avec T=0.005, le softmax garde ~65% des outils non-nuls parce que les cosine sims sont resserres (0.7-0.85).
Les `intentEmbedding` (1024D floats) sont aussi repetes pour chaque exemple du meme workflow.

### Solutions a tester
1. **Filtrer les sparse probs** plus agressivement (seuil 1e-3 au lieu de 1e-10) — devrait reduire a ~20-50 entries/exemple
2. **Grouper par workflow** — stocker intentEmbedding une seule fois par workflow, ref par index
3. **Top-K only** — ne garder que les top-10 probs par exemple (au lieu de tous les non-nuls)
4. **Passer par Node.js** (npx tsx) au lieu de Deno pour le benchmark — potentiellement meilleure gestion memoire
5. **Format binaire** (Float32Array) — mais change beaucoup de code

## Prochaines etapes

### P0 — Blocker fichier n8n 30K (voir section Blocker ci-dessus)
Reduire la taille du fichier sparse (top-K=10, grouper intentEmbeddings par workflow, ou format binaire).

### P1 — GRU wraps SHGAT : vocabulaire unifie tools + capabilities

**Insight cle**: le GRU est le sequenceur/orchestrateur, SHGAT fournit le vocabulaire enrichi.
- SHGAT = embeddings enrichis (message passing) pour tools ET capabilities
- GRU = decide a chaque step : quel tool OU quelle capability predire, et quand terminer
- SHGAT n'a plus besoin de "decider" — il enrichit les representations, le GRU decide tout

**Architecture cible**:
1. SHGAT check rapide : "une capability couvre l'intent entier ?" → si oui, executer directement
2. Sinon GRU construit le path avec un vocabulaire unifie (644 tools + 126 capabilities multi-tool)
3. A chaque step, le GRU peut predire un tool L0 OU une capability L1+
4. Si capability predite → expand ses `tools_used` dans le contexte, puis continuer

**Exemple**:
```
intent = "generate person, address, then hash everything"

step 1: ctx=[] → GRU predit `meta:personWithAddress` (capability L1)
  → expand dans le contexte: ctx = [fake:person, fake:address]
step 2: ctx=[fake:person, fake:address] → GRU predit `std:crypto_hash` (tool L0)
  → terminaison

= 2 steps au lieu de 3, en reutilisant une capability existante
```

**Ce qui existe deja en DB**:
- 126 capabilities multi-tool avec embeddings 1024D BGE-M3 (meme espace que les tools)
- `workflow_pattern.intent_embedding` = embedding de la capability
- `workflow_pattern.dag_structure.tools_used` = liste des tools constitutifs
- 21 traces hierarchiques (parent_trace_id) — peu mais en croissance (feature recente)

**Changements necessaires**:
1. **Vocabulaire** (simple): `setToolVocabulary()` accepte tools + cap IDs avec leurs embeddings
2. **Exemples dual-level** (moyen): generer pour chaque trace des exemples L0 (tools) ET L1 (capabilities)
3. **`buildPath()` modifie** (simple): si prediction = capability → expand `tools_used` dans le contexte
4. **Architecture GRU inchangee**: memes 5 inputs, meme GRU(64), meme similarity head — juste vocabulaire plus grand

### P2 — Cablage GRU en prod
Brancher le GRU dans le pipeline reel apres SHGAT retrieval:
1. SHGAT cherche une capability existante
2. Si pas de match → GRU(ctx=[]) → 1er outil → GRU(iteration) → suite
3. Enregistrer la nouvelle sequence comme capability

### P3 — Multi-start beam scoring
Le multi-start est decevant (3.3% vs 36.7% GRU-first). Le beam scoring favorise les paths courts.
Investiguer un re-ranking des beams base sur la coherence semantique du path complet.

### Fichiers modifies
- `lib/gru/src/n8n/build-soft-targets.ts` — streaming write + sparse format
- `lib/gru/src/benchmark-e2e.ts` — sparse loader, 3-mode step 9b
- `lib/gru/src/transition/gru-model.ts` — `buildPathAutoStart()`, `buildPathBeamMultiStart()`
