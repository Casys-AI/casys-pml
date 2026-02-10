# World Model Symbolique — Evaluation et Roadmap

## Analyse du concept par rapport au pipeline SHGAT+GRU

**Date** : 2026-02-10
**Panel** : Paper Analyst, TF.js Architect, Reporter
**Documents sources** :
- Spike 2026-01-28 : Transition Learning pour DR-DSP (4 options architecturales, decision Option B)
- Spike 2026-01-26 : Mock Registry & Exploration Learning (auto-curation, traces exploratoires)
- Epic 12 : Speculative Execution with Arguments (Stories 12.1-12.10, capstone = Story 12.8)
- Panel GRU Hypergraph (2026-02-09, consensus sur Compact Informed GRU)
- Benchmark E2E (2026-02-10, GRU-first vs SHGAT-first vs Multi-start)
- Resultats n8n Data Augmentation (2026-02-09, 3 seeds, KL weight sweep)

---

## 1. Resume Executif

Le pipeline est a environ **60% du world model complet**.

Le CompactInformedGRU constitue le **world model interne** : il imagine des sequences d'outils, predit leur terminaison, et peut explorer via beam search. La Story 12.8 (Exploratory Dry-Run) constituerait le **world model externe** : simuler les paths predits via execution hybride (real + mock), puis apprendre des resultats.

**Ce qui existe et fonctionne** :
- IMAGINE : GRU beam search predit des paths (Hit@1 64.9%, beam@3 exact 39.3% E2E)
- SCORE : SHGAT scoring semantique + spectre continu composite
- LEARN (infra) : PER Buffer, TD Error, Thompson Sampler implementes dans `lib/gru/src/training/`
- DATA : pipeline n8n augmentation (+15.6% beam@3 avec w=0.3)

**Ce qui manque** :
- SIMULATE : dry-run hybride (Story 12.8 non implementee)
- LEARN (circuit) : GRU pas dans la boucle online learning production
- CABLAGE : pipeline prod utilise encore SHGAT → DR-DSP au lieu de SHGAT → GRU
- RESULTATS : le modele predit des outils, pas des sorties (pas de dynamics model)

---

## 2. Genese : du TransitionMLP au CompactInformedGRU

### 2.1 Le probleme initial (spike 2026-01-28)

Le spike identifiait trois limitations fondamentales du pipeline :

1. **SHGAT statique** : score base uniquement sur l'intent, pas sur le contexte evolutif. `shgat.score(intent, allTools)` est appele UNE fois, pas a chaque etape.
2. **DR-DSP non-apprenant** : `findShortestPath(source, target)` utilise des poids statiques (similarite semantique dans l'hypergraphe), ne peut pas apprendre de nouvelles transitions.
3. **Pas de goal detection** : DR-DSP recoit `startTool` et `endTool` explicitement. Il ne detecte pas quand s'arreter.

### 2.2 Les 4 options et la decision

| Option | Approche | Verdict |
|--------|----------|---------|
| A | Enrichir SHGAT (re-scoring dynamique a chaque etape) | Rejetee — trop lent, terminaison floue |
| **B** | **Modele de transition separe (World Model)** | **Adoptee** |
| C | Enrichir DR-DSP avec apprentissage (poids appris sur les edges) | Rejetee — ne resout pas la goal detection |
| D | Beam Search avec SHGAT | Rejetee seule — combinee avec Option B |

Le spike decidait l'Option B et proposait un `TransitionMLP` :

```
input = concat(intentEmb[1024], meanPool(contextToolEmbs)[1024])
→ Linear(2048, 256) → ReLU → Linear(256, 256) → ReLU → Linear(256, numTools+1)
→ softmax(tools) + sigmoid(terminaison)
~500K params estime
```

### 2.3 Ce qui a ete construit

Le CompactInformedGRU depasse considerablement la spec originale :

- **Architecture** : GRU(64) recurrente au lieu de MLP feed-forward, permettant une memoire sequentielle ordonnee des outils deja executes
- **5 inputs** au lieu de 2 : `tool_emb`, `transition_features[5]`, `intent_emb`, `cap_fingerprint[212]`, `composite_features[3]`
- **Similarity head gelee** : 660K params frozen, projection dans l'espace d'embedding BGE-M3 1024D, dot-product avec la matrice d'outils
- **Tete de terminaison** separee avec spectre continu composite (remplace le seuil binaire)
- **Beam search** K=3 + multi-start + auto-start (`buildPathAutoStart()`)
- **Vocabulaire hierarchique** : VocabNode[] = tools L0 + capabilities L1+ dans un vocabulaire unifie
- **258K params trainables** (reduction deliberee apres panel 2026-02-09, ratio 5882:1 → 924:1)
- **Pipeline n8n** : 2465+ exemples supplementaires via soft targets KL

### 2.4 Ce qui reste du spike (non implemente)

1. **Integration avec DR-DSP** : le spike prevoyait que DR-DSP **utilise** le TransitionModel pour construire les paths. En pratique, le GRU a **remplace** DR-DSP. Le `buildPath()` du GRU fait exactement ce que le spike proposait (`transitionModel.predict(intent, path)` dans une boucle), mais sans passer par DR-DSP.

2. **Enregistrement automatique de capabilities** : le spike mentionnait "stocker la nouvelle sequence comme capability". C'est prevu mais pas implemente — les paths predits par le GRU ne sont pas persistes dans l'hypergraphe.

---

## 3. Etat des composants

### 3.1 IMAGINE — GRU Beam Search

**Status** : Implemente et benchmarke.

**Fichiers cles** :
- `lib/gru/src/transition/gru-model.ts` : `CompactInformedGRU` (~1600 lignes)
- `lib/gru/src/transition/types.ts` : `CompactGRUConfig`, `VocabNode`, `TransitionExample`

**Methodes de prediction** :
| Methode | Description | Usage |
|---------|-------------|-------|
| `predictNext()` | Predit le prochain outil (top-1) | Step-by-step |
| `predictNextTopK()` | Top-K avec scores | Evaluation, TD error |
| `buildPath()` | Construit un path complet depuis un 1er outil | Oracle 1st tool |
| `buildPathBeam()` | Beam search K chemins en parallele | Meilleure qualite |
| `buildPathAutoStart()` | GRU choisit le 1er outil (ctx=[]) | **Production recommandee** |
| `buildPathBeamMultiStart()` | K beams depuis les top-K 1ers outils | Experimental |

**Performances** (seed=42, n8n w=0.3, 30 traces test) :

| Mode | 1st tool @1 | Greedy exact | Beam@3 exact |
|------|-------------|-------------|-------------|
| SHGAT-first | 16.7% | 3.3% | 6.7% |
| **GRU-first** | **70.0%** | **36.7%** | 23.3% |

**Forces** :
- GRU-first ecrase SHGAT-first pour le 1er outil (70% vs 16.7%) car le GRU apprend quels outils *demarrent* les sequences (pattern temporel), tandis que le SHGAT pousse la similarite semantique a l'intent (hash → hash_checksum au lieu de read_file)
- Beam search explore des alternatives en parallele
- Vocabulaire hierarchique permet de predire des capabilities L1+ (raccourcis)

**Limites** :
- Multi-start decevant (3.3% vs 36.7% greedy) : le scoring de beam favorise les paths courts
- 258K params / 457 exemples prod = overfitting severe (train 98% vs test 52-64%)
- Les 43.7% de contextes contamines par branches paralleles du DAG (linearisation Kahn) degradent le signal

### 3.2 SIMULATE — HybridExecutor / SpeculativeExecutor

**Status** : Partiellement implemente. Le code existant est un STUB.

**Code existant** (`src/dag/speculation/`) :
| Fichier | Status | Detail |
|---------|--------|--------|
| `speculation-manager.ts` | Reutilisable | Threshold adaptatif, metriques hit/miss, feedback |
| `speculative-executor.ts` | **STUB** | Utilise `DenoSandboxExecutor` au lieu de `WorkerBridge`, `generateSpeculationCode()` retourne un placeholder |
| `integration.ts` | A adapter | Bridge vers nouveau executor |

**Ce qui est prevu (Story 12.8 — Exploratory Dry-Run)** :

```
Intent non couvert
→ GRU predit un path hypothetique
→ Pour chaque outil :
    canSpeculate(outil) ?
      OUI → execution REELLE via WorkerBridge (read_file, search, parse...)
      NON → execution MOCKEE (write_file, push, delete...)
→ Evaluer la viabilite (% reel, erreurs, coherence data flow)
→ Stocker trace exploratoire (exploratory: true, mocked: boolean par task)
```

**Prerequis non implementes** :
- Story 12.3 : `canSpeculate()` — security guard determinant safe vs unsafe
- Story 12.4 : recriture de `SpeculativeExecutor` avec WorkerBridge (4 jours)
- Story 12.5 : Speculation Cache & Validation

**C'est la piece manquante la plus critique** du world model. Sans simulation, le cycle Imagine → Learn n'a pas de signal de validation.

### 3.3 LEARN — PER + TD Error + Thompson Sampling

**Status** : Infrastructure implementee dans `lib/gru/src/training/`, **non cablee en production**.

**Fichiers** :
| Fichier | Classe/Fonction | Role |
|---------|-----------------|------|
| `per-buffer.ts` | `PERBuffer` | Buffer circulaire, sampling proportionnel a priority^alpha, IS weights |
| `td-error.ts` | `calculateTDError()`, `tdErrorFromProbability()` | TD error = \|actual - predicted\|, priority clamping |
| `thompson-sampler.ts` | `ThompsonSampler` | Beta(alpha, beta) par outil, Marsaglia-Tsang Gamma, decay |
| `mod.ts` | Re-exports | Point d'entree du module |

**Tests** : 46 tests unitaires (18 PER + 17 Thompson + 11 TD Error), tous verts, format Node.js.

**Online learning existant en production** (SHGAT uniquement, pas GRU) :
| Composant | Fichier | Role |
|-----------|---------|------|
| OnlineLearningController | `src/graphrag/learning/online-learning.ts` | V1 event-driven, K-head scoring |
| TrainSHGATUseCase | `src/application/use-cases/execute/train-shgat.use-case.ts` | ISHGATTrainer interface |
| PostExecutionService | `src/application/services/post-execution.service.ts` | Orchestration, PER batch training |
| Training lock | `src/graphrag/learning/training-lock.ts` | Mutex simple entre les 3 chemins |

**Gap critique** : 3 chemins d'entrainement concurrents sans coordination reelle. Le training lock empeche les races, mais pas les conflits de gradient. Le GRU devrait s'inserer via un 4eme chemin ou remplacer/consolider les existants.

**Cycle PER/Thompson prevu (non cable)** :
```
1. Execution reelle → resultat success/failure
2. TD Error = |1.0 - GRU_predicted_confidence|
3. PER Buffer.add(example, priority=|TD error|)
4. Thompson Sampler.update(toolId, success)
5. Periodiquement : PER Buffer.sample(batch) → GRU.trainStep()
6. Prochaine prediction : Thompson Sampler.sample(toolId) pondere la confiance
```

### 3.4 SCORE — SHGAT Scoring

**Status** : Deploye en production. Entrainement contrastif sur LiveMCPBench (282 exemples) + online learning.

**Role dans le world model** :
- **Pertinence semantique** : score intent → outil/capability (R@1=16.4%, R@3=37.6% sur LiveMCPBench avec training)
- **Spectre continu composite** : 3 features (bestCompositeScore, coverage, level) injectees dans le GRU via `comp_proj(3,8)`
- **Vocabulaire enrichi** : les embeddings SHGAT (apres message passing) sont utilises comme input du GRU au lieu des embeddings bruts BGE-M3

**Limites identifiees** :
- SHGAT optimise la **relevance semantique**, pas les **transitions temporelles** (mismatch C6 du panel)
- Le message passing dilue l'information structurelle dans le vecteur 1024D (prouve par expert-graphs)
- 282 exemples = bottleneck pour le training contrastif (overfit R@1=33.5%)

**Complementarite SHGAT/GRU** :
| Question | SHGAT | GRU |
|----------|-------|-----|
| "Quels outils sont pertinents pour cet intent ?" | Oui (scoring semantique) | Non |
| "Quel outil vient apres, sachant le contexte ?" | Non | Oui (prediction next-tool) |
| "Existe-t-il une capability qui couvre l'intent ?" | Oui (composite scoring) | Indirect (spectre continu) |
| "Quand la sequence est-elle terminee ?" | Non | Oui (tete de terminaison) |

---

## 4. DR-DSP : Config-Aware — Obsolete ou Complementaire ?

### 4.1 Path building : remplace par le GRU

Le spike 2026-01-28 prevoyait que DR-DSP utilise le TransitionModel pour construire les paths. En pratique, le GRU a **absorbe** ce role :

| Fonction | DR-DSP | GRU |
|----------|--------|-----|
| Trouver le premier outil | SHGAT top-1 (16.7%) | `buildPathAutoStart()` (**70%**) |
| Construire le chemin | `findShortestHyperpath(start, end)` | `buildPath()` / `buildPathBeam()` |
| Detecter la terminaison | Non supporte (recoit `endTool`) | Tete apprise (69-73% accuracy) |
| Apprendre des traces | Impossible (poids statiques) | Supervised + PER |

**Verdict** : DR-DSP n'est plus necessaire pour le path building. Le GRU le surpasse sur tous les axes mesurables.

### 4.2 Roles residuels de DR-DSP

DR-DSP est REPOSITIONNE de "generateur de paths" a "validateur + schema matcher" (consensus paper-analyst / tf-architect). Quatre roles residuels :

1. **Validation structurelle post-GRU** : verifier que le path GRU est topologiquement coherent dans l'hypergraphe. Le GRU peut predire `[read_file → slack_send]` sans qu'il existe d'edge entre ces outils — DR-DSP detecterait l'anomalie.

2. **Schema matching via ProvidesEdge** : valider la compatibilite data flow entre outils (`tool_A.output → tool_B.input`). C'est une dimension que le GRU n'adresse PAS — il predit des sequences d'outils, pas des schemas de donnees. Les `ProvidesEdge` de l'hypergraphe permettent de verifier que les sorties d'un outil correspondent aux entrees attendues du suivant.

3. **Fallback cold start** : avant que le GRU soit entraine (scenario transitoire ou nouveau deploiement), DR-DSP peut fournir un chemin de secours base sur la topologie du graphe. Ce role devient obsolete une fois le GRU operationnel.

4. **Exploration guidee (Story 12.8)** : DR-DSP peut proposer des chemins *hypothetiques* a travers l'hypergraphe pour des intents non couverts. Le GRU predit depuis ses patterns appris, DR-DSP propose depuis la structure du graphe — les deux approches sont complementaires pour l'exploration.

### 4.3 Config-aware : dans le GRU

L'idee "config-aware" (navigation differente selon les permissions utilisateur) est mieux placee dans le GRU :

- Le GRU a 5 inputs extensibles — un `config_features[N]` peut etre ajoute comme 6eme input
- Le GRU **apprend** a adapter ses predictions au contexte. DR-DSP ne le peut pas (algorithme, pas modele).
- Les permissions/preferences sont un signal continu, pas un filtre binaire sur les edges du graphe

**Recommandation** : ne pas investir dans un DR-DSP config-aware. Si necessaire, encoder la config comme feature du GRU.

---

## 5. Mock Registry & Exploration Learning

### 5.1 Le cycle exploratoire avec PER/TD

Le spike 2026-01-26 et la Story 12.8 decrivent un cycle d'exploration. Avec le PER et le Thompson Sampler nouvellement implementes dans `lib/gru/src/training/`, ce cycle s'integre naturellement :

```
1. GRU predit un path P pour un intent non couvert
      → buildPathBeam(intentEmb, firstTool, compositeFeatures)
2. Thompson Sampler pondere la confiance par outil
      outils peu explores → variance haute → exploration favorisee
      sampler.sample("std:psql_query") → 0.87 (connu, stable)
      sampler.sample("new:tool") → 0.43 (inconnu, variance haute)
3. Dry-run hybride execute le path P
      canSpeculate(read_file) = true → execution REELLE
      canSpeculate(write_file) = false → execution MOCKEE
4. TD Error mesure la surprise du GRU :
      predicted = model.predictNextTopK(intent, ctx, 10).find(targetTool).score
      actual = 1.0 si outil correct
      priority = |actual - predicted|
5. PER Buffer stocke les exemples
      buffer.add(example, priority) → haute priorite = rejoue plus souvent
6. Thompson Sampler met a jour les distributions Beta
      sampler.update("read_file", true)   → success (alpha++)
      sampler.update("mock_tool", false)  → failure (beta++)
7. Training batch depuis PER
      const { entries, weights } = buffer.sample(32, annealedBeta)
      → GRU.trainStep(entries, weights) avec IS weights pour correction de biais
```

### 5.2 Traces exploratoires : gardes de qualite

Les traces exploratoires contiennent des resultats mocks. Le panel 2026-02-09 a identifie des risques analogues avec les traces single-tool. Les gardes recommandees :

| Garde | Mecanisme | Raison |
|-------|-----------|--------|
| **Deduplication par intent** | Hash(intentEmbedding) + targetToolId | Eviter la sur-representation d'un meme pattern |
| **Ponderation par mock ratio** | `weight = 1.0 - 0.5 * mockRatio` | Traces 100% reelles = signal plein, 50% mock = signal reduit |
| **Masque de loss** | `terminationLossMask = 0` si mock | La terminaison mockee n'est pas fiable |
| **Loss weighting BCE** | `w_pos = N_neg/N_total, w_neg = N_pos/N_total` | Equilibrer terminal/non-terminal apres ajout |
| **Recalibrage terminationLossWeight** | `new_weight = 10.0 * (old_ratio / new_ratio)` | Le facteur 10.0 est calibre pour 42/58, toxique si le ratio change |

### 5.3 Auto-curation via error types

Le spike 2026-01-26 proposait d'utiliser la classification d'erreurs existante (`classifyErrorType()` dans migration 024, `queryErrorTypeAffinity()` dans `trace-feature-extractor.ts`) pour auto-deprecier les mocks defectueux.

Integration avec TD Error :

| Error type | Action sur le mock | Priorite PER |
|------------|-------------------|-------------|
| VALIDATION | Mock a mauvaise shape → deprecier fortement | **Haute** (modele doit apprendre a eviter ce chemin) |
| NOT_FOUND | Mock reference ressource stale → marquer obsolete | Moyenne |
| NETWORK/TIMEOUT | Pas la faute du mock → ignorer | Basse (ne change pas le mock) |
| PERMISSION | Pas la faute du mock → ignorer | Basse |

Un mock qui cause un VALIDATION error recoit un TD error eleve (surprise negative : le modele pensait que ce chemin fonctionnait). Le PER remonte cet exemple en priorite pour que le GRU apprenne a l'eviter.

**Promotion** : quand un mock passe `successCount >= 5 && failureCount == 0`, il est promu "canonical" et recoit un poids 1.0 dans le training. Les non-canonical restent a 0.5.

---

## 6. Ecarts avec un "vrai" World Model

### 6.1 Transition Model vs Dynamics Model

Notre GRU est un **transition model** : il predit le prochain *outil* (action discrete) etant donne le contexte. Un veritable **dynamics model** (au sens MuZero/Dreamer) predit aussi l'*etat resultant* :

```
Transition Model (ce qu'on a) :
  P(next_tool | intent, context_tools) → distribution sur 644+ outils

Dynamics Model (ce qu'il faudrait) :
  P(next_tool, next_state | intent, context_tools, current_state)
  ou next_state = schema des sorties de l'outil
```

La Story 12.7 (Argument-Aware Learning) effleure ce sujet en apprenant des patterns d'arguments (`hasFilePath`, `fileExtension`, `argCount`), mais ne va pas jusqu'a predire les valeurs de sortie.

**Impact pratique** : sans dynamics model, le dry-run hybride est NECESSAIRE pour valider les paths. On ne peut pas simuler "dans la tete" — il faut executer (au moins partiellement). C'est une difference fondamentale avec MuZero qui peut faire des rollouts purement internes.

**Verdict** : un dynamics model serait couteux en complexite pour un gain incertain. Le dry-run hybride est une solution pragmatique qui joue le role de "simulation externe" a la place d'un modele neuronal interne.

### 6.2 Argument Resolution

Le world model actuel ignore les **arguments** des outils. Le GRU predit `[read_file, json_parse, slack_send]` mais pas les arguments `{path: "/data.json"}` ni la resolution de references entre etapes (`json_parse.input = read_file.output`).

La Story 12.2 (Argument Resolver) est **implementee** : elle resout les arguments statiques (literal, reference, parameter) a partir du contexte. Mais elle n'est pas connectee au GRU — le resolver travaille sur le DAG statique, pas sur les paths predits.

**Gap** : le GRU predit un path, puis il faut un module separe pour inferer les arguments. Ce module pourrait etre :
- Le resolver 12.2 existant (si le path est enregistre comme DAG avec static_structure)
- Un modele de generation d'arguments (complexe, hors scope court terme)
- Le dry-run lui-meme (execution reelle = arguments resolus de facto)

### 6.3 Confidence Calibration

Le GRU produit des probabilites via softmax (next-tool) et sigmoid (terminaison), mais ces probabilites ne sont **pas calibrees**. Un score de 0.7 ne signifie pas "70% de chances de succes" — c'est un score relatif.

**Impact** : le seuil de terminaison (`terminationProb > 0.7`) est un hyperparametre arbitraire, pas un seuil de probabilite reel. Le spectre continu composite ameliore la situation (la tete apprend quand terminer), mais la calibration absolue reste absente.

**Mitigation existante** : le Thompson Sampler fournit une estimation bayesienne *calibree* de la fiabilite par outil (Beta(alpha, beta) avec mean = alpha/(alpha+beta)). En combinant les scores GRU (relatifs) avec les estimations Thompson (calibrees), on obtient une confiance plus fiable.

**Fusion multi-source necessaire** : chaque composant produit un score dans son propre espace, sans calibration croisee :
- GRU softmax : probabilite relative sur le vocabulaire (somme = 1)
- SHGAT cosine : similarite semantique [-1, 1] normalisee
- Thompson Beta : estimation bayesienne [0, 1] par outil

Ces trois signaux ne sont pas comparables directement. Une couche de fusion (ex: learned weighted average, ou un petit MLP de calibration) est necessaire pour produire un score unique actionnable en production. C'est un chainon manquant critique identifie conjointement par le paper-analyst et le tf-architect.

### 6.4 Absence de planification multi-step

MuZero utilise MCTS (Monte Carlo Tree Search) pour planifier N coups a l'avance en explorant l'arbre des possibles. Notre beam search est une version simplifiee : elle explore K chemins en parallele mais sans backtracking ni re-evaluation.

**Consequence** : le beam search est gourmand (K = nombre de chemins, pas de re-scoring) et favorise les paths courts (score cumulatif sans length normalization — bug identifie dans les lessons learned). Une recherche arborescente plus sophistiquee ameliorerait la qualite des paths longs.

---

## 7. Roadmap

Les etapes sont ordonnees par dependances logiques et rapport effort/impact.

### Phase 1 : Cablage GRU en production (P0, ~3 jours)

**Objectif** : remplacer SHGAT → DR-DSP par SHGAT → GRU pour la construction de paths.

```
Pipeline actuel :  Intent → SHGAT top-K → DR-DSP shortestPath(start, end) → DAG
Pipeline cible  :  Intent → SHGAT check capability → si match: executer
                                                    → sinon: GRU(ctx=[]) → path → DAG
```

**Prerequis** : aucun. Le GRU est pret.
**Impact** : 16.7% → 70% pour le choix du 1er outil (benchmark 2026-02-10).
**Fichiers** : `src/infrastructure/di/adapters/execute/dag-suggester-adapter.ts`, integration GRU.

### Phase 2 : Boucle PER/Thompson en production (~2 jours)

**Objectif** : connecter le PER Buffer et le Thompson Sampler au pipeline d'execution. Chaque execution produit un TD error, chaque prediction utilise Thompson pour l'exploration.

**Prerequis** : Phase 1.
**Impact** : apprentissage en continu du GRU, amelioration progressive sans re-training batch.

### Phase 3 : Vocabulaire unifie tools + capabilities (~2 jours)

**Objectif** : activer le vocabulaire hierarchique VocabNode en production pour que le GRU puisse predire des capabilities L1+ en plus des outils L0.

**Prerequis** : Phase 1.
**Impact** : reduction de la longueur des paths (capabilities = raccourcis), meilleure couverture des intents complexes.

### Phase 4 : Exploratory dry-run (Story 12.8, ~4-5 jours)

**Objectif** : fermer la boucle Imagine → Simulate → Learn. Le GRU predit des paths, le dry-run hybride les valide, les traces alimentent le PER Buffer.

**Prerequis** : Phases 1 + 2 + Stories 12.3 (canSpeculate) + 12.4 (recriture SpeculativeExecutor avec WorkerBridge).
**Impact** : la piece manquante du world model. Permet au systeme d'apprendre de facon proactive.

### Phase 5 : Mock registry avec auto-curation (Story 12.9, ~3-4 jours)

**Objectif** : persister les mocks, les versionner, les auto-deprecier via les error types.

**Prerequis** : Phase 4.
**Impact** : fiabilite du cycle exploratoire, reduction du mock drift.

### Phase 6 : Consolidation online learning (~3 jours)

**Objectif** : unifier les 3 chemins d'entrainement concurrents autour du PER Buffer central.

**Prerequis** : Phase 2.
**Impact** : elimination du risque de training desynchronise, simplification architecturale (1 chemin au lieu de 3).

### Phase 7 : Confidence calibration multi-source (~2-3 jours)

**Objectif** : fusionner les scores GRU (softmax), SHGAT (cosine) et Thompson (Beta) en un score unique calibre. Les trois signaux operent dans des espaces incomparables — une couche de fusion apprise est necessaire.

**Approches possibles** :
- Learned weighted average : `score = w1*gru + w2*shgat + w3*thompson`, poids appris sur les traces validees
- MLP de calibration : `Dense(3, 8, relu) → Dense(8, 1, sigmoid)`, entraine sur les outcomes reels
- Platt scaling : post-hoc, s'applique independamment a chaque composant avant fusion

**Prerequis** : Phases 1 + 2 (les 3 sources doivent etre actives en production).
**Impact** : score de confiance unique actionnable pour le seuil de speculation et la decision d'execution.

### Vue d'ensemble

```
Phase 1: Cablage GRU  ──────→ Phase 2: PER/Thompson prod ──→ Phase 6: Consolidation
        │                            │                               │
        └──→ Phase 3: Vocab unifie   │                               └──→ Phase 7: Calibration
                                     │
                                     └──→ Phase 4: Dry-run ──→ Phase 5: Mock registry
```

**Estimation totale** : ~19-23 jours pour le world model complet (Phases 1-7).

---

## Annexe : Tableau comparatif Spike vs Implementation

| Element du spike 2026-01-28 | Status | Implementation |
|-----------------------------|--------|----------------|
| **Option B : TransitionModel separe** | Implemente | `CompactInformedGRU` dans `lib/gru/src/transition/gru-model.ts` |
| `TransitionMLP(concat(intent, meanPool(ctx)))` | **Depasse** | GRU(64) avec memoire sequentielle ordonnee (pas mean pooling) |
| `predict(intentEmbedding, contextToolIds)` | Implemente | `predictNext()`, `predictNextTopK()` |
| `isTerminal(intent, contextTools) → 0-1` | Implemente | Tete de terminaison sigmoid + spectre continu composite |
| `train(examples)` | Implemente | `trainStep()` avec focal CE + KL + BCE, PER-ready |
| `softmax(tools) + sigmoid(terminaison)` | Implemente | similarity_head(frozen) + terminaison_head |
| "SHGAT filtre, TransitionModel construit" | **Modifie** | GRU remplace DR-DSP. SHGAT = scoring + vocabulary, pas filtrage |
| "DR-DSP valide/optimise le chemin" | **Non fait** | DR-DSP n'est plus dans la boucle. Role residuel : validation/fallback |
| "MLP simple sur embeddings agreges" | **Depasse** | 5 inputs, dropout 0.4, label smoothing, temperature annealing |
| "meanPool(contextToolEmbs)" | **Remplace** | GRU cell preserve l'ordre. Mean pooling = perte d'information temporelle |
| Architecture : "combien de couches? quelle dim?" | **Resolu** | Panel 2026-02-09 : GRU(133→64), fusion dense(152→64), embedding_proj(64→1024) |
| "Seuil de terminaison: 0.7 ou adaptatif?" | **Resolu** | Spectre continu composite : pas de seuil, la tete apprend |
| "TransitionModel score parmi top-K SHGAT ou tous?" | **Resolu** | Tous les outils (similarity head sur vocabulaire complet 644+) |
| Donnees : "per-training.ts est deja parfait" | **Valide** | Format TransitionExample confirme, augmente par n8n pipeline |

### Elements non prevus dans le spike (ajouts post-panel)

| Element | Date | Source |
|---------|------|--------|
| Beam search K=3 + multi-start | 2026-02-10 | Benchmark E2E |
| Pipeline n8n data augmentation | 2026-02-09 | Research data |
| Vocabulaire hierarchique VocabNode | 2026-02-10 | Sprint 2 panel |
| PER Buffer + TD Error + Thompson | 2026-02-10 | Sprint 4 |
| Spectre continu composite | 2026-02-10 | Panel architecture |
| Transition features [5 dims] | 2026-02-09 | Panel GRU hypergraph |
| Capability fingerprint [212→16] | 2026-02-09 | Panel GRU hypergraph |
| Focal loss + label smoothing | 2026-02-09 | Panel GRU hypergraph |
| `buildPathAutoStart()` (GRU choisit le 1er outil) | 2026-02-10 | Benchmark E2E finding |
