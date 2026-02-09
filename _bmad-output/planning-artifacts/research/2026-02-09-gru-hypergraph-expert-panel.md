# Panel d'experts ML : GRU TransitionModel sur Hypergraphe SHGAT

**Date** : 2026-02-09
**Format** : Panel de 3 experts ML, modere, 3 tours de discussion
**Moderateur** : Claude Opus 4.6

---

## 1. Participants et format

| Role | Expertise | Focus |
|------|-----------|-------|
| **expert-sequences** | RNN/GRU/Transformers, sequence modeling | Architecture GRU, bottleneck, boucles |
| **expert-graphs** | GNN, hypergraph learning, message passing | Structure hypergraphe, injection structurelle, SHGAT |
| **expert-data** | Data augmentation, few-shot learning, training strategies | Dataset, regularisation, augmentation |

**Protocole** : Chaque expert a lu le code source (`gru-model.ts`, `types.ts`, `AUDIT.md`, `test-training-enriched.ts`), repondu a des questions ciblees, puis debattu en 3 tours avec des questions croisees relayees par le moderateur.

---

## 2. Contexte et chiffres cles

### Systeme
- **SHGAT** (Graph Attention) : enrichit les embeddings d'outils (1024-dim) via message passing sur l'hypergraphe hierarchique, puis score la pertinence intent -> outil pour trouver le PREMIER outil
- **GRU TransitionModel** : prend le premier outil et construit le chemin complet step-by-step (next tool + detection de terminaison)

### Hypergraphe
- 644 Tools (noeuds) <-> 212 Capabilities L0 (hyperedges) <-> 26 Caps L1 <-> 1 Cap L2 (racine)

### Benchmarks actuels (meilleur run : SHGAT L0-only)
| Metrique | Train | Test |
|----------|-------|------|
| Next-tool accuracy (Hit@1) | 88.0% | 57.1% |
| Hit@3 | — | 86.3% |
| MRR | — | 0.705 |
| Termination accuracy | 97.8% | 72.9% |
| Exact path match (E2E) | — | 57.6% |

### Dataset
- 349 exemples de transition, 146 traces multi-tool, 644 outils
- ~1.64M parametres trainables, ratio params/exemples = **5,882:1**

---

## 3. Observation factuelle : 581/644 outils actuellement deconnectes

**Identifie par expert-graphs**, valide par les 3 experts.

Seulement **63 outils sur 644 (9.8%)** sont actuellement connectes a des capabilities L0 via les traces d'execution. Les 581 restants n'ont pas encore de lien capability observe.

> **CORRECTION PO** : Cette situation est un etat **TEMPORAIRE**. A terme, TOUS les outils seront connectes a des capabilities dans l'hypergraphe. L'architecture doit etre concue pour le cas nominal (100% de couverture), pas pour l'etat actuel incomplet. "Ne pensez pas en mode MVP qui marche un petit peu et qu'on change dans 2 jours."

### Implications revisees

1. **Le capability conditioning parametrique est pertinent a long terme.** Bien qu'actuellement actif sur seulement 10% des outils, il deviendra pleinement operationnel quand le graphe sera complet. L'architecture doit l'inclure des maintenant.

2. **Le Jaccard structurel et le bigram bias restent complementaires.** Ils offrent un signal immediat (meme partiel) sans cout parametrique, et leur utilite augmentera avec la couverture du graphe.

3. **Le data augmentation (n8n scraping) accelere la couverture.** Les 7,868 workflows n8n connecteront davantage d'outils au graphe, rendant le capability conditioning de plus en plus efficace.

**Consequence** : l'architecture integre les deux approches (capability conditioning parametrique + Jaccard/bigram zero-param). Le non-parametrique fournit un signal immediat, le parametrique monte en puissance avec la couverture du graphe.

---

## 4. Points de consensus (unanimes)

### C1 : Le bottleneck est le dataset, pas l'architecture
Les 3 experts s'accordent : 349 exemples pour 644 outils (ratio ~0.5 exemple/outil) est insuffisant. Le 57% actuel est **proche du plafond** pour ce volume de donnees. Aucune modification architecturale ne compensera le manque de data.

### C2 : Reduire le modele (hidden 256 -> 64)
Consensus sur la reduction drastique. Le ratio 5,882:1 (params/exemples) est catastrophique. Avec hidden=64 : ~340K params, ratio 1,220:1.

| Config | Params | Ratio |
|--------|--------|-------|
| Actuel (hidden=256) | ~1.64M | 5,882:1 |
| Propose (hidden=64) | ~244K | 875:1 |

### C3 : Ignorer L1/L2 pour la transition
Les resultats le confirment : L0-only = 57.1% test vs L0+L1+L2 = 42.9% test. L'information hierarchique haute (L1/L2) est trop abstraite pour les patterns de transition et agit comme du bruit via over-smoothing. Expert-graphs demontre que la cap L2 (unique) est un bottleneck d'information qui "contamine" les embeddings avec un signal global non-informatif.

### C4 : Le similarity head est la bonne approche
ProtoNet/MatchingNet ne s'appliquent pas aux transitions conditionnelles (le meme outil peut suivre n'importe quel autre selon l'intent). Le similarity head (projection dans l'espace d'embedding + dot-product avec matrice gelee) est semantiquement correct pour ce probleme.

### C5 : Le temperature annealing est trop agressif
Consensus : 0.15->0.06 est trop sharp, rend le beam search inutile et aggrave l'overfitting.
Recommandation : `temperatureStart: 0.20, temperatureEnd: 0.12`, arreter le annealing a 70% des epochs.

### C6 : Le mismatch d'objectif SHGAT est reel mais ne necessite pas de changer le SHGAT
Identifie par expert-graphs, valide par expert-sequences : le SHGAT optimise la **relevance semantique** (intent -> outil), pas les **patterns de transition temporels** (outil -> outil). Le +15.7% de SHGAT L0 est un effet indirect (la proximite semantique correle avec la co-occurrence temporelle). La solution n'est pas de modifier le SHGAT mais d'ajouter des signaux structurels complementaires au GRU.

---

## 5. Desaccords et resolutions

### D1 : Reduire OU enrichir le modele ?

| Position | Expert | Argument |
|----------|--------|----------|
| Reduire les params (hidden 32-64) | expert-data | Ratio params/exemples catastrophique, la reduction est la regularisation la plus puissante |
| Enrichir la representation (cap conditioning, features structurelles) | expert-sequences | Un GRU tiny mais bien informe bat un GRU moyen mais aveugle |

**Resolution** : expert-sequences demontre que les deux sont **synergiques, pas contradictoires**. L'enrichissement structural se fait via des features pre-calculees (zero ou quasi-zero params supplementaires), pas via des modules trainables. On peut reduire le GRU de 1.4M a ~244K params ET ajouter du signal structurel. Expert-data valide cette approche.

### D2 : Capability conditioning parametrique vs Jaccard zero-param

| Position | Expert | Argument |
|----------|--------|----------|
| Capability fingerprint projete (dense 212->64, ~13K params) | expert-sequences | Le modele apprend a exploiter les capabilities |
| Jaccard bias post-hoc (zero params) | expert-graphs | Zero risque d'overfitting, meme signal |

**Resolution initiale** : expert-graphs avait note que le cap conditioning est actuellement actif sur seulement 10% des outils (63/644 connectes). Expert-sequences avait concede le Jaccard bias comme prioritaire.

**Resolution finale (correction PO)** : La deconnexion etant temporaire (tous les outils seront connectes a terme), l'architecture doit inclure le capability conditioning des maintenant. Les deux approches sont complementaires et non concurrentes :
- **Jaccard bias** : signal immediat, zero params, degrade gracieusement
- **Capability conditioning** : signal plus riche (appris), monte en puissance avec la couverture du graphe

### D3 : Hidden dim 64 vs 128

| Position | Expert | Argument |
|----------|--------|----------|
| hidden=32-64 | expert-data | Ratio le plus favorable, regularisation maximale |
| hidden=128 | expert-sequences (initial) | Le GRU(64) compresse 16x, risque de perte de patterns |

**Resolution** : expert-sequences propose une **input projection** dense(1024->128) AVANT le GRU, decouplant la compression d'espace (projection lineaire) du sequencement temporel (GRU). Le GRU(128->64) travaille dans un espace deja compresse. Les 3 experts convergent sur hidden=64 avec input projection.

### D4 : Repeat count head vs heuristique

| Position | Expert | Argument |
|----------|--------|----------|
| 3eme tete de sortie (repeat count, regression) | expert-sequences (initial) | Le modele apprend quand repeter |
| Heuristique "sticky bias" | expert-sequences (revise) | Pas assez d'exemples de boucles (~30-50) pour une tete apprise |

**Resolution** : expert-sequences revise sa position apres le feedback. Heuristique "sticky bias" en v1 (si top-1 == dernier outil, ne pas terminer, max 3 repetitions). Repeat count head reporte a > 500 exemples de boucles.

### D5 : Scheduled sampling

Expert-sequences l'avait mentionne comme lacune. Expert-data demontre que c'est **dangereux** avec 349 exemples (0.57^3 = 18.5% de sequences correctes en autoregressive). Propose a la place une augmentation par "contexte bruite" (swapper des outils du contexte par des hard negatives). Approche validee par expert-sequences comme complementaire aux paraphrases.

---

## 6. Recommandations priorisees

### Phase 1 : Quick wins (1-2 jours, zero re-training)

| # | Action | Effort | Params ajoutes | Impact estime |
|---|--------|--------|----------------|---------------|
| 1a | **Jaccard logit bias** : `logits += alpha * jaccard[last_tool, :]` | 1 jour | 1 (alpha) | +3-5% Hit@1 |
| 1b | **Bigram logit bias** : `logits += beta * bigram_freq[last_tool, :]` | 0.5 jour | 1 (beta) | +2-4% Hit@1 |
| 1c | **Temperature annealing** : 0.20->0.12, stop a 70% epochs | 10 min | 0 | +2-4% Hit@1, beam search redevient utile |

**Comment** : Pre-calculer la matrice Jaccard [644, 644] depuis `toolToCapMatrix` et la matrice bigram depuis les traces d'entrainement. Ajouter les bias apres le similarity head. Grid search sur alpha, beta in {0.1, 0.2, 0.5, 1.0}.

### Phase 2 : Architecture "Compact Informed GRU" (1 semaine)

| # | Action | Effort | Impact estime |
|---|--------|--------|---------------|
| 2a | **Input projection** dense(1024->128) avant le GRU | 0.5 jour | Decouple compression et sequencement |
| 2b | **GRU hidden 256->64** | 1 ligne | Reduction 83% des params |
| 2c | **Transition features** [5 dims] concatenees a l'input projete | 1 jour | Signal structurel par timestep |
| 2c2 | **Capability conditioning** cap_context[16] au concat de fusion | 0.5 jour | Signal de couverture capabilities (+13K params) |
| 2d | **Dropout 0.1->0.4** (dense) + **recurrent_dropout 0.25** | 1 ligne | Regularisation |
| 2e | **Label smoothing** epsilon=0.1 | 0.5 jour | Empeche la sur-confiance |
| 2f | **Repeat heuristic** "sticky bias" (max 3 repetitions) | 0.5 jour | +10% exact path match |

**Architecture cible** (detail en section 7).

### Phase 3 : Data augmentation (2-4 semaines)

| # | Action | Effort | Impact estime |
|---|--------|--------|---------------|
| 3a | **Scraping n8n** : ~7800 workflows, mapping MCP, reconstruction sequences | 2 semaines | +1,000-1,500 traces propres |
| 3b | **Paraphrases d'intents** x5-8 via LLM sur dataset scrape + existant | 0.5 semaine | x5-8 le volume |
| 3c | **Contexte bruite** : swap d'outils par hard negatives dans le contexte | 1 semaine | Robustesse aux erreurs de prediction |
| 3d | **Intents quantifies** pour les boucles ("lire 3 fichiers") | 0.5 semaine | Signal de repetition lie a l'intent |

**Cible** : 349 -> 5,000-10,000 exemples de transition. Ratio params/exemples : 875:1 -> ~50:1.

### Exclusions de la v1

| Proposition | Raison | Reconsiderer quand |
|-------------|--------|--------------------|
| Joint training SHGAT+GRU | Pas assez de data (~2.5M params combinee), risque de catastrophic forgetting sur le SHGAT | Dataset > 5,000, GPU disponible |
| SHGAT separe pour transitions | Duplication injustifiee, le bigram fait mieux pour moins cher | Jamais |
| Repeat count head (3eme tete) | Pas assez d'exemples de boucles (~30-50) | > 500 exemples de boucles |
| Transformer remplacement | Aucun avantage pour sequences 2-5 tokens | Sequences > 10 steps |
| Spectral hypergraph convolution | Overkill pour 644 noeuds, bottleneck = data pas modele | Dataset > 5,000 |
| Prediction hierarchique (capability d'abord, puis outil) | Pas assez de data hierarchique, L1/L2 degradent | Dataset > 5,000 + couverture L1/L2 amelioree |
| Meta-learning (MAML/ProtoNet) | 1.3 exemples/classe en moyenne, transitions conditionnelles | Non applicable a ce probleme |
| Scheduled sampling | 18.5% de sequences correctes en autoregressive, bruit catastrophique | Precision single-step > 70% |

---

## 7. Architecture cible detaillee

### Actuel (1.64M params, ratio 5,882:1)

```
tool_emb[1024] -------> GRU(1024, 256) --> concat(gru[256], intent_proj[256])
intent_emb[1024] -----> dense(1024,256) -/      |
                                                 v
                                          dense(512, 256, relu)
                                                 |
                                          dropout(0.1)
                                                 |
                                    +------------+------------+
                                    |                         |
                             embedding_proj              termination
                             (256, 1024)                 (256, 1, sigmoid)
                                    |
                             similarity_head
                             (1024, 644, frozen, /temp)
```

### Propose "Compact Informed GRU" (~257K params, ratio 921:1)

```
tool_emb[1024] --> input_proj(1024, 128, linear) ---+
transition_features[5] (jaccard, shared_caps,       |-> concat[133]
                        is_repeat, cap_novelty) ----+        |
                                                             v
                                                    GRU(133, 64)
                                                    dropout=0.25 recurrent
                                                             |
                                                             v
intent_emb[1024] --> intent_proj(1024, 64, relu) --+
cap_fingerprint[212] --> cap_proj(212, 16, relu) --+--> concat(gru[64], intent[64], cap[16])
                                                             |
                                                             v
                                                      dense(144, 64, relu)
                                                             |
                                                      dropout(0.4)
                                                             |
                                          +------------------+------------------+
                                          |                                    |
                                   embedding_proj                        termination
                                   (64, 1024)                           (64, 1, sigmoid)
                                          |
                                   similarity_head
                                   (1024, 644, frozen, /temp)
                                          |
                                   + alpha * jaccard[last_tool]      <-- zero-param bias
                                   + beta * bigram[last_tool]        <-- zero-param bias
                                          |
                                   + sticky_repeat_heuristic         <-- post-process
```

Le `cap_fingerprint[212]` est le OR logique des capability fingerprints des outils deja dans la sequence, projete en 16 dims. Il encode "quelles capabilities ont ete couvertes", offrant au modele un signal de progression dans l'espace des capabilities. Actuellement actif pour ~10% des outils ; a terme actif pour 100% quand le graphe sera complet.

### Comparaison des composants

| Composant | Actuel | Propose | Delta params |
|-----------|--------|---------|-------------|
| GRU | (1024, 256) = 984K | (133, 64) = 38K | -946K |
| Input projection | - | (1024, 128) = 131K | +131K |
| Intent projection | (1024, 256) = 262K | (1024, 64) = 66K | -196K |
| Cap projection | - | (212, 16) = 3.4K | +3.4K |
| Combined dense | (512, 256) = 131K | (144, 64) = 9.3K | -122K |
| Embedding projection | (256, 1024) = 263K | (64, 1024) = 66K | -197K |
| Termination head | (256, 1) = 257 | (64, 1) = 65 | -192 |
| Jaccard + bigram bias | - | 2 scalaires | +2 |
| **TOTAL TRAINABLE** | **~1,641K** | **~257K** | **-84%** |

---

## 8. Projections de performance

| Scenario | Hit@1 test | Conditions |
|----------|-----------|------------|
| Actuel | 57% | 349 exemples, hidden=256, aucun bias structurel |
| Phase 1 (logit bias + temp) | 62-65% | Memes 349 exemples, +Jaccard +bigram, temp 0.20->0.12 |
| Phase 2 (compact GRU) | 65-70% | Memes 349 exemples, architecture reduite + features structurelles |
| Phase 3 (+ n8n scraping) | 72-78% | ~2,000 exemples, architecture phase 2 |
| Phase 3 (+ paraphrases) | 75-82% | ~5,000+ exemples, architecture phase 2 |

Ces projections sont basees sur :
- L'amelioration de +15.7% observee entre raw et SHGAT L0 (signal structurel aide)
- Le ratio params/exemples et les courbes d'apprentissage typiques en few-shot
- Les estimations d'expert-data sur la couverture du scraping n8n

---

## 9. Lecons apprises du panel

1. **Le mismatch d'objectif SHGAT (relevance) vs GRU (transition) est reel** mais la solution n'est pas de modifier le SHGAT. Des signaux structurels complementaires (Jaccard, bigram) cote GRU sont plus pragmatiques.

2. **L'enrichissement SHGAT dilue l'information structurelle** (prouve par expert-graphs via le code du message passing). Le GRU recoit un vecteur 1024d ou les contributions des capabilities sont melangees de facon non-decomposable. D'ou le besoin de features structurelles explicites.

3. **Avec < 2 exemples/classe, le similarity head est superieur a ProtoNet/MatchingNet** car il projette le contexte (qui est riche) plutot que de prototyper les classes (qui sont sous-echantillonnees).

4. **Le non-parametrique et le parametrique sont complementaires.** Les logit bias pre-calcules (Jaccard, bigram) offrent un signal immediat sans cout en data. Le capability conditioning parametrique monte en puissance avec la couverture du graphe. Inclure les deux dans l'architecture permet une degradation gracieuse : les bias zero-param compensent quand le graphe est partiel, le conditioning appris prend le relais quand le graphe est complet.

5. **Reduire ET enrichir sont synergiques** : la reduction libere de la capacite de regularisation, l'enrichissement structurel compense la perte de capacite representationnelle. Un GRU tiny mais bien informe bat un GRU moyen mais aveugle.

6. **Architecturer pour le cas nominal, pas pour l'etat courant.** La couverture du graphe (63/644 outils connectes aujourd'hui) est un etat temporaire. Les choix architecturaux doivent cibler le regime a 100% de couverture, pas l'etat partiel actuel. Le data augmentation (n8n scraping) accelere la convergence vers cet etat complet.

---

## Annexe : Fichiers cles

| Fichier | Role |
|---------|------|
| `lib/gru/src/transition/gru-model.ts` | TransitionModel (GRU + similarity head + termination head) |
| `lib/gru/src/transition/types.ts` | Types, config, defaults |
| `lib/gru/AUDIT.md` | Benchmarks, resultats, pistes d'amelioration |
| `lib/gru/src/test-training-enriched.ts` | Script d'entrainement end-to-end avec SHGAT |
| `lib/shgat-tf/src/training/autograd-trainer.ts` | Message passing SHGAT (dense autograd) |
| `src/graphrag/workflow-patterns/n8n-scraper.ts` | Scraper n8n existant |
| `src/graphrag/workflow-patterns/tool-mapper.ts` | Mapping n8n -> MCP tools |

---

## Appendice : Traces single-tool — Faut-il les inclure dans le training du GRU ?

**Date** : 2026-02-09
**Format** : Discussion ciblee, panel de 3 experts, 2 tours
**Question** : Les 758 traces single-tool (78% des donnees en DB) sont actuellement exclues du training GRU. Faut-il les inclure, et si oui comment ?

### Contexte chiffre

| Donnee | Valeur |
|--------|--------|
| Traces totales en DB | 904 |
| Traces multi-tool (>1 outil) | 146 (16%) |
| Traces single-tool (=1 outil) | 758 (84%) |
| Exemples de transition actuels | 349 (depuis multi-tool uniquement) |
| Ratio isTerminal actuel | ~146 terminal=1 / ~203 terminal=0 (42%/58%) |
| Ratio isTerminal si inclusion | ~904 terminal=1 / ~203 terminal=0 (82%/18%) |

Chaque trace single-tool `[tool_A]` genererait exactement 1 exemple :
```
{
  intentEmbedding: [...],
  contextToolIds: [],        // vide (premier step)
  targetToolId: "tool_A",    // l'outil unique
  isTerminal: 1              // ET c'est le dernier
}
```

### Pipeline de decision : qui predit le premier outil ?

Point critique identifie par les 3 experts : dans le pipeline actuel, le **SHGAT** predit le premier outil, pas le GRU. Le GRU recoit `firstToolId` en entree de `buildPath()` (ligne 449 de `gru-model.ts`). Cependant, durant le training, les exemples avec `contextToolIds: []` entrainent bien la tete next-tool sur la prediction du premier outil. C'est une redondance partielle avec le SHGAT.

### Analyse technique : comportement du GRU avec contexte vide

**Point critique identifie par expert-sequences** apres lecture du code (`gru-model.ts:78-90`).

Quand `contextToolIds = []`, la methode `getContextEmbeddings()` (ligne 328-347) genere un seul vecteur zero, puis `padContext()` remplit les 20 timesteps avec des zeros. Le masking layer (`maskValue: 0`, ligne 78-80) masque **tous les timesteps**.

Comportement concret TF.js Keras masking sur le GRU :
- Le GRU demarre avec hidden state = zeros (pas de `initialState` configure, lignes 83-90)
- Les timesteps masques ne modifient pas le hidden state
- **Le GRU output = vecteur zero de dimension `hiddenDim`**

Ce hidden state zero est concatene avec `intentProj(intentEmbedding)` en ligne 100-102. Donc pour les single-tool : `concat = [zeros_256 | intentProj_256]`. **Toute l'information vient de l'intent projection seule** — la branche GRU contribue un vecteur nul.

**Risque de raccourci** : la tete de terminaison apprendra "quand la moitie GRU du hidden state est nulle, `isTerminal=1`". C'est un shortcut appris plutot qu'une reelle capacite de decision.

---

### Tour 1 : Positions initiales

#### expert-sequences (RNN/GRU)

> Le GRU a deux tetes, et il faut raisonner sur chacune separement.
>
> **Tete de terminaison** : les single-tool sont potentiellement precieux. Actuellement, le modele apprend `isTerminal=1` uniquement sur le dernier step des traces multi-tool, ou le contexte contient deja N-1 outils. Les single-tool introduisent un pattern radicalement different : "pour cet intent, terminaison IMMEDIATE au step 0, contexte vide". C'est un signal que le modele ne voit jamais actuellement. Mais attention au raccourci "GRU zeros = terminal" (voir analyse technique ci-dessus).
>
> **Tete next-tool** : c'est plus problematique. Pour les single-tool, `contextToolIds = []`, donc le GRU recoit une sequence tout-zeros (masquee). La prediction next-tool repose **uniquement** sur l'intent embedding. Or, en inference, le GRU ne predit JAMAIS le premier outil — le SHGAT le donne. Entrainer la tete next-tool sur ce scenario cree un mismatch train/inference.
>
> **Dilution des gradients GRU** : avec 758 single-tool vs 349 multi-tool, ~68% des gradients de la tete next-tool viendraient d'exemples ou la branche GRU est nulle. Le modele optimiserait principalement le chemin `intent_proj -> hidden_proj -> next_tool_head` (sans GRU). Les poids GRU ne recevraient des gradients que sur 32% des exemples, laissant le GRU sous-entraine. Le modele convergerait vers un raccourci "intent-only" au lieu d'apprendre les transitions sequentielles.
>
> **Ma position** : inclure les single-tool, mais avec un masquage de loss sur la tete next-tool. Seule la tete de terminaison devrait apprendre de ces exemples. Techniquement, ca demande une modification du `trainStep()` pour supporter un loss mask par exemple.

#### expert-graphs (GNN/hypergraphe)

> Je suis d'accord avec expert-sequences sur la separation des tetes, mais je vois un probleme plus fondamental : le **desequilibre massif**.
>
> Avec inclusion : 904 isTerminal=1 vs 203 isTerminal=0. C'est un ratio **4.5:1**. La tete de terminaison va simplement apprendre a toujours dire "stop". C'est pire que le 42%/58% actuel qui est relativement equilibre.
>
> De plus, les 758 single-tool couvrent combien d'outils uniques ? Si c'est concentre sur 20-30 outils populaires (ce qui est probable avec les patterns d'usage reels), on n'ajoute pas de diversite mais du bruit repete.
>
> **Ma position** : inclure, mais avec (a) un sous-echantillonnage agressif des single-tool (max 1:1 avec les multi-tool) et (b) un poids reduit sur ces exemples (ex: `weight=0.3`).

#### expert-data (data augmentation/training)

> Les deux points precedents sont valides. Mais je veux ajouter un angle data/training strategy.
>
> **Les 758 traces ne sont pas 758 signaux independants.** Beaucoup partagent le meme intent embedding (memes capabilities executees sur des inputs differents). La vraie diversite est le nombre d'intents uniques, pas le nombre de traces.
>
> Plus important : le probleme actuel du GRU est l'**overfitting** (train 88% vs test 57%). Ajouter 758 exemples tres homogenes (tous `contextToolIds=[], isTerminal=1`) ne resout pas l'overfitting — ca peut l'aggraver en rendant la distribution d'entrainement non-representative de la distribution de test (qui est multi-tool).
>
> **Ma position** : les single-tool sont utiles UNIQUEMENT pour la tete de terminaison, et UNIQUEMENT apres deduplication par intent. Mon estimation : 758 traces -> ~150-200 intents uniques single-tool. Prendre 1 exemple par intent, avec class weighting inverse pour equilibrer isTerminal.

---

### Tour 2 : Debat croise et convergence

**Moderateur** : Expert-sequences, que pensez-vous du risque de desequilibre signale par expert-graphs ?

#### expert-sequences

> Le desequilibre est reel et **plus grave que le ratio 4.5:1 ne le suggere**. Il y a un effet amplificateur que je veux souligner.
>
> Les deux tetes partagent `hiddenDropout` (ligne 112-115 de `gru-model.ts`). C'est le noeud critique. Le `terminationLossWeight` est actuellement a **10.0** (ligne 85 de `types.ts`), calibre pour la distribution actuelle (~42%/58%). Avec 87% de terminaux apres inclusion des single-tool :
>
> 1. La sigmoid sature vers 1.0 — la tete apprend un biais constant "toujours terminer"
> 2. Le **hidden state partage s'adapte** — `hidden_proj` encode un prior "terminal" dans sa representation
> 3. La tete next-tool souffre — le hidden state est optimise pour la terminaison (gradient dominant)
> 4. Le `terminationLossWeight: 10.0` **amplifie** le probleme — facteur 10x sur un signal deja 6.7x surrepresente = gradient terminaison **~67x** plus fort que le signal next-tool multi-tool
>
> Trois options techniques :
>
> 1. **Loss weighting dynamique** : `BCE_termination = w_pos * target * log(p) + w_neg * (1-target) * log(1-p)` avec `w_pos = N_neg/N_total`, `w_neg = N_pos/N_total`. Ca equilibre les gradients sans toucher aux donnees. **ET recalibrer `terminationLossWeight`** pour le nouveau ratio.
> 2. **Sous-echantillonnage** : comme propose par expert-graphs, plafonner les single-tool.
> 3. **Focal loss pour la terminaison** : on a deja le focal loss pour next-tool, l'etendre a la terminaison. Les exemples "faciles" (single-tool = terminaison evidente) recevront naturellement moins de gradient.
>
> Je recommande l'option 1 (loss weighting + recalibrage terminationLossWeight), c'est la plus simple et la plus stable.

**Moderateur** : Expert-data, sur la deduplication : si on deduplique par intent, perd-on du signal ?

#### expert-data

> Non, au contraire. Si le meme intent genere 15 traces single-tool (meme outil a chaque fois), les 15 exemples ont le **meme intent embedding et le meme target** — c'est de la pure duplication. Le modele voit le meme gradient 15 fois. C'est de l'overfitting sur cet intent specifique.
>
> Un exemple par intent unique capture tout le signal utile. Si l'intent A mene toujours a tool_X en single-step, 1 exemple suffit pour l'apprendre.
>
> Concretement, ma recommandation de pipeline :
> 1. Charger les 758 single-tool avec leur intent embedding
> 2. Grouper par `(intent_embedding hash, tool_id)` — les doublons exacts
> 3. Garder 1 exemplaire par groupe
> 4. Appliquer loss weighting (option 1 de expert-sequences) pour equilibrer isTerminal
> 5. Masquer la loss next-tool pour ces exemples (position expert-sequences)

**Moderateur** : Expert-graphs, un dernier point sur l'impact structurel dans l'hypergraphe ?

#### expert-graphs

> Point subtil : les single-tool sont souvent des outils **feuilles** dans l'hypergraphe — des outils suffisamment autosuffisants pour resoudre un intent seuls (ex: `psql_query`, `read_file`). C'est une information structurelle : ces outils ont une forte "autonomie" dans le graphe.
>
> Cela rejoint la proposition de **capability conditioning** de la section 7 du rapport. Les outils single-tool sont souvent ceux qui couvrent une capability entiere a eux seuls. Cette information est deja encodee dans le `cap_fingerprint` propose. Donc l'inclusion des single-tool pour la terminaison est **coherente** avec l'architecture cible.
>
> Je converge avec expert-data et expert-sequences. Inclusion conditionnelle avec les gardes appropriees.

---

### Consensus du panel

Les 3 experts convergent sur une **inclusion partielle et conditionnee** des traces single-tool :

| Decision | Detail |
|----------|--------|
| **Inclure pour la tete de terminaison** | OUI — signal unique "terminaison immediate au step 0" |
| **Inclure pour la tete next-tool** | NON — mismatch train/inference + dilution des gradients GRU (68% sur chemin intent-only) |
| **Deduplication** | PAR INTENT — grouper par (intent_embedding_hash, tool_id), garder 1 par groupe |
| **Estimation post-dedup** | ~150-200 exemples (vs 758 bruts) |
| **Equilibrage** | Loss weighting BCE avec frequences inverses sur isTerminal |
| **Recalibrage terminationLossWeight** | OBLIGATOIRE — le 10.0 actuel calibre pour 42/58 deviendrait toxique a 82/18 |
| **Implementation** | Masque de loss par-exemple : `next_tool_loss_mask = 0` pour les single-tool |

### Risques techniques identifies (expert-sequences)

| Risque | Mecanisme | Mitigation |
|--------|-----------|------------|
| **Raccourci "GRU zeros = terminal"** | Le masking genere un hidden state nul pour les single-tool. La tete de terminaison apprend un shortcut base sur la norme du hidden state au lieu d'une decision semantique. | La deduplication + loss weighting limitent l'exposition. A surveiller : si la terminaison accuracy train monte > 99% rapidement, le raccourci est appris. |
| **Dilution des gradients GRU** | Sans masquage next-tool, 68% des gradients traverseraient le chemin intent-only (GRU=zeros). Les poids GRU seraient sous-entraines. | Masquer la loss next-tool pour les single-tool (recommandation adoptee). |
| **Hidden state partage contamine** | Les deux tetes partagent `hidden_proj + hiddenDropout`. Le gradient de terminaison (amplifie par `terminationLossWeight=10.0`) sur 87% d'exemples terminaux orienterait le hidden state vers un mode "terminal par defaut". | Recalibrer `terminationLossWeight` proportionnellement au nouveau ratio. Ex: `10.0 * (0.42/0.82) ≈ 5.1` pour compenser. |
| **terminationLossWeight=10.0 amplifie le desequilibre** | Ce facteur calibre pour 42/58 cree un gradient terminaison ~67x plus fort que le signal next-tool quand le ratio passe a 87/13. | Formule : `new_weight = old_weight * (old_terminal_ratio / new_terminal_ratio)`. Avec dedup (~65/35) : `10.0 * (0.42/0.65) ≈ 6.5`. |

### Impact estime sur les metriques

| Metrique | Avant | Apres (estime) | Raisonnement |
|----------|-------|----------------|--------------|
| Termination accuracy (test) | 72.9% | **78-83%** | Le modele apprend a terminer au step 0 pour certains intents |
| Next-tool accuracy (test) | 57.1% | **57.1%** (inchange) | Les single-tool sont masques pour cette tete |
| Exact path match (E2E) | 57.6% | **60-63%** | Meilleure terminaison = moins de sur-extension des chemins |
| Dataset total | 349 exemples | ~500-550 exemples | +150-200 exemples dedupliques |

### Implementation technique recommandee

```typescript
// 1. Modifier la requete SQL dans test-training.ts (retirer le filtre > 1)
const traceRows = await sql`
  SELECT et.id, et.task_results, et.success,
         wp.intent_embedding::text as intent_embedding
  FROM execution_trace et
  JOIN workflow_pattern wp ON et.capability_id = wp.pattern_id
  WHERE et.task_results IS NOT NULL
    AND jsonb_array_length(et.task_results) >= 1  -- INCLUT single-tool
    AND wp.intent_embedding IS NOT NULL
  ORDER BY et.executed_at DESC
`;

// 2. Generer les exemples avec un flag de masquage
interface TransitionExampleExt extends TransitionExample {
  maskNextToolLoss: boolean;  // true pour les single-tool
}

// 3. Pour chaque trace single-tool :
if (toolSequence.length === 1) {
  examples.push({
    intentEmbedding,
    contextToolIds: [],
    targetToolId: toolSequence[0],
    isTerminal: 1,
    maskNextToolLoss: true,  // ne PAS entrainer next-tool sur cet exemple
  });
}

// 4. Deduplication par intent hash + tool_id
const seen = new Set<string>();
const dedupExamples = singleToolExamples.filter(ex => {
  const key = `${hashEmbedding(ex.intentEmbedding)}:${ex.targetToolId}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

// 5. Dans trainStep(), modifier la loss :
// - Focal CE next-tool : multiplier par (1 - maskNextToolLoss)
// - BCE terminaison : appliquer class weighting w_pos/w_neg
// - Recalibrer terminationLossWeight :
//   old_ratio = count(terminal=1) / total SANS single-tool
//   new_ratio = count(terminal=1) / total AVEC single-tool dedup
//   new_weight = 10.0 * (old_ratio / new_ratio)
//   Ex: 10.0 * (0.42 / 0.65) ≈ 6.5 (avec ~150 single-tool dedup)

// 6. Monitoring post-entrainement :
// - Si termination accuracy train > 99% des epoch 3 → raccourci "GRU zeros" detecte
// - Verifier que next-tool accuracy n'a PAS baisse (signe de contamination hidden state)
```

### Priorite

Cette modification s'inscrit dans la **Phase 2** du roadmap (section 6 du rapport principal). Elle peut etre implementee en **0.5 jour** et testee rapidement. C'est un quick win a faible risque : le pire cas est une amelioration nulle de la terminaison (les exemples dedupliques sont trop homogenes), le meilleur cas est +5-10% sur la precision de terminaison en test.
