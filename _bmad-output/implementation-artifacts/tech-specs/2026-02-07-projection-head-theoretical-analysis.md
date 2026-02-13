# Analyse Theorique : Projection Head pour SHGAT-TF et GRU TransitionModel

**Date** : 2026-02-07
**Statut** : Analyse complete
**Auteur** : Analyse automatisee (Claude Opus 4.6)
**Contexte** : Systeme de recommandation d'outils MCP (260 outils, 118 traces, 361 exemples)

---

## 1. Resume executif

**Verdict : La projection head est redondante et probablement nefaste dans l'architecture actuelle du SHGAT-TF. Son ajout au GRU TransitionModel serait egalement injustifie.**

Les raisons principales :

1. **Double projection redondante** : Le K-head scorer effectue deja 16 projections Q/K independantes (chacune 1024D -> 64D) avec similarite cosinus. Ajouter une projection head revient a empiler une 17e projection par-dessus les 16 existantes, sans justification theorique dans le cadre supervisee contrastif (InfoNCE) qui est deja utilise.

2. **Asymetrie de capacite ecrasante** : Le K-head dispose de 16 heads x 64D = 2.097.152 parametres (W_q + W_k), soit ~6x plus que la projection head (328K). La projection head est structurellement incapable de "corriger" ou "completer" le K-head.

3. **Regime de donnees incompatible** : 328K parametres supplementaires pour 361 exemples d'entrainement donne un ratio parametres/exemples de 920:1. Les travaux sur le contrastive learning montrent que l'overfitting se manifeste specifiquement par la degradation de la similarite positive hors distribution d'entrainement (Zhuo et al., 2024).

4. **Vocabulaire trop petit** : Avec 260 outils, le probleme de discrimination fine que la projection head est censee resoudre peut etre mieux adresse par le curriculum learning et le hard negative mining deja en place.

5. **Les resultats experimentaux confirment** : Hit@1 identique (67.1%), variance E2E elevee (33-73%) -- la projection head n'apporte aucune amelioration mesurable.

**Recommandation** : Desactiver la projection head (`useProjectionHead: false`), investir dans l'amelioration du K-head existant (diversite des heads, temperature adaptative, hard negative mining renforce).

---

## 2. Fondements theoriques

### 2.1 Pourquoi la projection head fonctionne en vision/langage

La projection head a ete introduite par SimCLR (Chen et al., 2020) et adoptee par CLIP (Radford et al., 2021) et MoCo v2 (Chen et al., 2020). Les mecanismes theoriques identifies sont :

**A. Goulot d'etranglement informationnel (Information Bottleneck)**

Selon les travaux recents (Liu et al., 2025, "Projection Head is Secretly an Information Bottleneck", ICLR 2025), une projection head efficace agit comme un filtre qui :
- Elimine l'information non pertinente pour l'objectif contrastif
- Preserve uniquement le signal utile pour la tache

L'intuition : en vision, les augmentations (rotation, recadrage, couleur) creent des vues differentes du meme objet. La projection head apprend a *ignorer* les variations dues aux augmentations (style, texture locale) pour ne garder que l'information semantique dans l'espace contrastif. Le backbone, lui, conserve toute l'information car la perte contrastive ne s'applique qu'apres le projecteur.

**B. Expansion et retrecissement (Expansion & Shrinkage)**

Wen & Li (2023, "Unraveling Projection Heads in Contrastive Learning") identifient deux regimes :
- **Expansion** : le projecteur augmente le rang effectif des representations -> benefique
- **Retrecissement** : le projecteur reduit le rang -> nefaste pour la classification aval

Les projecteurs non-lineaires (MLP + ReLU) operent generalement en regime d'expansion, ce qui explique leur superiorite sur les projections lineaires (+3%) et l'absence de projection (+10%).

**C. Prevention de l'effondrement des features**

Le projecteur empeche le "feature collapse" : sans lui, l'optimisation contrastive tend a projeter toutes les representations sur un sous-espace de faible rang. Avec le projecteur, les features du backbone occupent l'espace complet.

### 2.2 Pourquoi ces mecanismes NE S'APPLIQUENT PAS a notre cas

**Difference fondamentale #1 : Pas d'augmentation de donnees**

SimCLR/CLIP/MoCo utilisent la projection head pour separer l'information invariante (classe/concept) de l'information variante (augmentation/style). Dans notre systeme :
- L'intent est un embedding fixe de `text-embedding-3-large` (pas d'augmentation)
- Les embeddings d'outils sont fixes (BGE-M3, pre-calcules)
- Il n'y a pas de "vues" differentes du meme outil a rapprocher

Sans augmentation, le mecanisme de goulot d'etranglement n'a rien a filtrer. La projection head ne fait que re-projeter des embeddings deja stables.

**Difference fondamentale #2 : Apprentissage supervise, pas self-supervised**

SimCLR utilise la projection head pendant le pre-entrainement self-supervised, puis la jette pour le fine-tuning. Le role du projecteur est de proteger le backbone des distorsions induites par la perte contrastive.

Notre SHGAT-TF utilise un apprentissage **supervise contrastif** (InfoNCE avec labels connus). La projection head n'est pas jetee -- elle est utilisee a l'inference. Cela contredit le paradigme standard ou le projecteur est un artefact d'entrainement.

**Difference fondamentale #3 : Les embeddings sont deja dans un espace semantique bien structure**

Les embeddings BGE-M3 / text-embedding-3-large sont issus de modeles de langage pre-entraines sur des milliards de tokens. Ils capturent deja les nuances semantiques. La projection head est concue pour des representations de bas niveau (features CNN) qui necessitent une transformation non-lineaire pour devenir discriminantes. Ce n'est pas le cas ici.

---

## 3. Analyse SHGAT-TF : K-head vs Projection Head

### 3.1 Anatomie du K-head scorer

Le K-head scorer actuel fonctionne comme suit :

```
Pour chaque head h (h = 0..15) :
  Q_h = W_q[h] @ intent_projected    # [64]
  K_h = W_k[h] @ node_embedding      # [64]
  score_h = cosine(Q_h, K_h)         # scalaire

score_final = mean(score_0, ..., score_15)
```

**Capacite** :
- 16 heads x (W_q[1024, 64] + W_k[1024, 64]) = 16 x 131,072 = 2,097,152 parametres
- Chaque head apprend une sous-espace de projection de 64 dimensions
- La similarite cosinus normalise les magnitudes (pas de biais de norme)
- La moyenne des heads est un estimateur robuste (reduction de variance)

### 3.2 Anatomie de la projection head

```
z = L2_norm(W2 @ ReLU(W1 @ enriched_emb + b1) + b2)  # [256]
score_proj = dot(z_intent, z_node) / temperature       # scalaire

score_final = (1 - alpha) * khead_score + alpha * proj_score
```

**Capacite** :
- W1[1024, 256] + b1[256] + W2[256, 256] + b2[256] = 328,192 parametres
- Une seule "head" de projection
- L2 normalisation + dot product / temperature = cosine / temperature

### 3.3 La redondance structurelle

**Le K-head et la projection head font la meme chose** : projeter des embeddings de haute dimension vers un espace de basse dimension, puis calculer une similarite cosinus.

| Aspect | K-head | Projection Head |
|--------|--------|-----------------|
| Projection | W_q, W_k lineaires | W1 lineaire + ReLU + W2 lineaire |
| Dimension | 64D par head x 16 | 256D unique |
| Similarite | Cosinus | Cosinus (L2 norm + dot = cosinus) |
| Non-linearite | Aucune dans Q/K | ReLU entre W1 et W2 |
| Fusion | Moyenne des heads | Blend lineaire alpha |
| Parametres | 2.1M | 328K |

La seule difference est la non-linearite ReLU dans la projection head. Or, cette non-linearite est censee apporter l'avantage "expansion" identifie par Wen & Li (2023). Mais :

1. L'enrichissement par message passing (upward + downward) inclut deja des non-linearites (LeakyReLU, ELU dans l'aggregation attentionnelle)
2. Les embeddings arrivent au scorer deja non-lineairement transformes
3. Une seule couche de ReLU ne fournit pas suffisamment de capacite transformatrice face a 16 projections Q/K

### 3.4 L'argument de la "discrimination fine"

La tech spec existante motive la projection head par la discrimination entre outils semantiquement proches (`code:filter` vs `code:map`, cosinus BGE ~0.95).

Cependant, le K-head avec 16 heads est *specifiquement concu* pour cela :
- Chaque head peut apprendre a discriminer selon un axe different
- Head 3 pourrait separer filter/map, head 7 pourrait separer read/write
- 16 axes de discrimination independants > 1 projection MLP

Le probleme n'est pas le manque de capacite du K-head, c'est potentiellement :
- Un entrainement insuffisant (361 exemples pour 2.1M parametres)
- Des negatives trop faciles (curriculum learning pas assez agressif)
- Un nombre d'epoques insuffisant

### 3.5 Calcul des parametres effectifs

Avec 361 exemples d'entrainement et le blending alpha=0.5, les gradients de la projection head recoivent 50% de la responsabilite du score final. Cela signifie :

- K-head : 2.1M parametres, recoit ~50% des gradients -> parametres effectifs par exemple : ~2,900
- Projection head : 328K parametres, recoit ~50% des gradients -> parametres effectifs par exemple : ~454

En d'autres termes, le ratio params/exemples passe de 5,800:1 (K-head seul) a 6,720:1 (K-head + projection). Ce qui est deja extremement eleve, et la projection head ne fait qu'aggraver le probleme.

### 3.6 Serait-il preferable d'augmenter le nombre de K-heads ?

**Reponse : Non.** 16 heads x 64D = 1024D correspond exactement a la dimension de l'embedding BGE-M3. Augmenter a 32 heads x 64D = 2048D doublerait les parametres sans benefice : les projections Q/K de chaque head depasseraient la dimensionnalite intrinseque des embeddings d'entree.

Le vrai levier est la **qualite de l'entrainement**, pas la capacite du modele.

---

## 4. Analyse GRU TransitionModel

### 4.1 Architecture actuelle

```
context [seqLen, 1024] -> GRU(256) -> hidden [256]
intent [1024] -> Dense(256, ReLU) -> intent_proj [256]
[hidden; intent_proj] -> Dense(256, ReLU) -> Dense(numTools, softmax)
                                           -> Dense(1, sigmoid)    [termination]
```

Avec la similarity head activee :
```
hidden_proj [256] -> Dense(1024) -> embedding_proj [1024]
embedding_proj @ (all_tool_embeddings.T / temperature) -> scores [numTools]
-> softmax -> probabilities
```

### 4.2 Le GRU agit deja comme une projection apprise

Le GRU est fondamentalement un encodeur sequentiel qui :
1. Projete les embeddings d'outils (1024D) vers un espace cache (256D)
2. Accumule l'information sequentielle via les gates de reset/update
3. Produit un etat cache (256D) qui encode le contexte du workflow

La couche `embedding_proj` (Dense(256 -> 1024, lineaire)) re-projete ensuite cet etat cache vers l'espace d'embedding original pour calculer la similarite avec les embeddings d'outils.

**Cette chaine GRU -> Dense est deja une projection apprise** avec :
- Non-linearites (tanh/sigmoid dans le GRU, ReLU dans hidden_proj)
- Reduction dimensionnelle (1024 -> 256 -> 1024)
- Architecture bottleneck naturelle

### 4.3 Ajout d'une projection head au GRU : analyse

Ajouter une projection head au GRU reviendrait a :
```
hidden_proj [256] -> Proj(256 -> 128 -> 128, ReLU, L2_norm)
-> dot(proj_hidden, proj_tools) / temperature
```

**Problemes** :
1. **Redundance** : Le GRU + Dense fait deja la meme chose
2. **Perte d'information** : 256D -> 128D compresse un etat deja compresse (1024 -> 256)
3. **Similarity head deja optimale** : La similarity head avec temperature annealing (0.15 -> 0.06) et les embeddings geles est exactement le pattern CLIP mais en mieux adapte (les embeddings ne bougent pas, seule la projection apprend)
4. **Hard negative mining deja en place** : Le GRU utilise deja le focal loss (gamma configurable) et le margin loss sur les hard negatives les plus proches en embedding space

### 4.4 Verdict pour le GRU

**La projection head n'apporterait rien au GRU TransitionModel.** L'architecture actuelle (similarity head + temperature annealing + focal loss + hard negative margin loss) est deja bien concue pour la discrimination fine entre outils proches. Le bottleneck naturel du GRU (1024 -> 256 -> 1024) joue le role fonctionnel d'un projecteur.

---

## 5. Specificite du use case PML

### 5.1 Taille du vocabulaire

**260 outils** est un vocabulaire extremement petit par rapport aux contextes ou la projection head excelle :
- CLIP : ~30,000+ classes ImageNet / vocabulaire texte illimite
- SimCLR : 1000 classes ImageNet
- Systemes de recommandation : 10,000+ items typiquement

Avec 260 outils, la plupart des paires (intent, outil) sont clairement distinctes. Les cas de confusion fine (`code:filter` vs `code:map`) representent peut-etre 10-20 paires ambigues sur C(260,2) = 33,670 paires possibles. Le K-head avec 16 heads a largement la capacite de separer 20 paires ambigues.

### 5.2 Taille du dataset

**361 exemples** est critiquement insuffisant pour entrainer une projection head de 328K parametres :

| Modele | Parametres | Exemples | Ratio |
|--------|-----------|----------|-------|
| SimCLR (ResNet-50) | ~23M (backbone) + ~500K (projecteur) | 1.2M (ImageNet) | 0.4:1 |
| CLIP | ~400M | 400M paires | 1:1 |
| Notre K-head | 2.1M | 361 | 5,800:1 |
| Notre K-head + proj | 2.4M | 361 | 6,720:1 |

Le ratio 6,720:1 est catastrophique. Meme avec une regularisation L2 10x plus forte, les gradients sur 361 exemples ne peuvent pas constraindre efficacement 328K parametres supplementaires.

Les travaux sur l'overfitting en contrastive learning (Zhuo et al., 2024, "Overfitting in Contrastive Learning?") montrent specifiquement que :
- Le terme de similarite positive drive l'overfitting
- Le modele apprend a diminuer la similarite positive *uniquement* pour les exemples d'entrainement
- La capacite de detection des paires positives hors distribution se degrade

### 5.3 Nature du probleme de selection d'outils

La selection d'outils MCP est un probleme de **classification multi-classe a labels discrets**, pas un probleme d'alignement multimodal continu. Les distinctions cles :

| Aspect | Vision/Langage (CLIP) | Selection d'outils (PML) |
|--------|----------------------|--------------------------|
| Input | Images/texte brut | Embedding pre-calcule |
| Output | Alignement continu | Selection discrete (top-K) |
| Augmentations | Riches (crop, flip, color) | Aucune |
| Negative mining | Batch implicite (grand batch) | Explicite (curriculum, K=8) |
| Pre-training | Oui, puis fine-tune | Non, entrainement direct |

Le contrastive learning avec projection head est concu pour la premiere colonne. Notre cas est fondamentalement un probleme de scoring supervise avec perte contrastive -- ce qui justifie le K-head multi-attention mais pas la projection head.

### 5.4 Workflow sequentiel

La construction de workflow (SHGAT pour le premier outil, GRU pour la suite) ajoute une dimension sequentielle. La qualite E2E depend du produit des precisions a chaque etape :

```
P(path_correct) = P(tool_1 correct) * P(tool_2 | tool_1 correct) * ...
```

Ameliorer Hit@1 de 67% a 75% aurait plus d'impact sur la precision E2E que tout ajustement de la projection head. Les pistes a fort impact sont :
- Augmentation de donnees synthetiques (paraphrases d'intents)
- Plus de traces d'execution (118 -> 500+)
- Ensemble learning SHGAT + GRU pour le premier outil

---

## 6. Recommandations architecturales concretes

### 6.1 Action immediate : desactiver la projection head

```typescript
// Dans la config d'entrainement
const config: Partial<SHGATConfig> = {
  useProjectionHead: false,  // Desactiver
  // ... reste de la config
};
```

Justification : pas de benefice mesure, ajout de complexite et de parametres inutiles.

### 6.2 Ameliorations du K-head existant

**A. Diversite forcee des heads (Orthogonal Regularization)**

Ajouter une penalite qui force les matrices W_q des differentes heads a etre orthogonales :

```
L_orth = sum_{i != j} |cos(W_q[i], W_q[j])|^2
```

Cela force chaque head a capturer un aspect different de la relation intent-outil. Cout : ~20 lignes de code, zero parametre supplementaire.

**B. Temperature adaptative par head**

Au lieu d'une temperature globale (0.07), apprendre une temperature par head :

```
score_h = cosine(Q_h, K_h) / tau_h
```

Avec `tau_h` trainable (initialise a 0.07). Cela permet aux heads "semantiques" d'etre plus strictes et aux heads "structurelles" d'etre plus tolerantes. Cout : 16 parametres supplementaires.

**C. Hard negative mining plus agressif**

Le curriculum learning actuel echantillonne les negatives en 3 tiers (facile/moyen/difficile) base sur la precision. Passer a un echantillonnage adaptatif par exemple :

- Pour chaque intent, calculer les scores K-head de tous les outils
- Selectionner les negatives parmi les top-20 mal classes (faux positifs)
- Ces "hard negatives" ciblent exactement les confusions que le modele doit corriger

### 6.3 Augmentation de donnees

**A. Paraphrases d'intents**

Utiliser un LLM pour generer 5-10 paraphrases de chaque intent d'entrainement :
```
"Delete SHGAT params from database"
-> "Remove all SHGAT parameters from the DB"
-> "Clear the shgat_params table"
-> "Drop SHGAT configuration entries from storage"
```

Multiplier les 361 exemples par 5 = 1,805 exemples, reduisant le ratio params/exemples de 5,800:1 a 1,160:1.

**B. Perturbation d'embedding (Gaussian noise)**

Ajouter un bruit gaussien aux embeddings d'intent pendant l'entrainement :
```
intent_augmented = intent + N(0, sigma * ||intent||)
```

Avec sigma = 0.01-0.05. Regularisation implicite a cout zero.

### 6.4 Ameliorations specifiques pour le GRU

**A. Beam search pour la construction de chemin**

Au lieu de `argmax` greedy, maintenir un beam de K=3 chemins candidats et selectionner le meilleur chemin complet.

**B. Teacher forcing degressif**

Pendant l'entrainement, reduire progressivement le teacher forcing pour exposer le modele a ses propres erreurs.

---

## 7. Alternatives a explorer

### 7.1 Approches a fort potentiel

| Approche | Effort | Impact attendu | Justification |
|----------|--------|----------------|---------------|
| Paraphrases d'intents | Moyen | Eleve | Multiplie le dataset par 5-10x |
| Orthogonal regularization sur K-heads | Faible | Moyen | Force la diversite des heads |
| Temperature learnable par head | Faible | Moyen | Meilleur calibrage |
| Hard negative mining adaptatif | Moyen | Moyen-Eleve | Cible les confusions reelles |
| Bruit gaussien sur embeddings | Faible | Faible-Moyen | Regularisation implicite |
| Beam search GRU | Moyen | Moyen | Reduit les erreurs de chemin |

### 7.2 Approches a eviter

| Approche | Raison de l'exclusion |
|----------|----------------------|
| Projection head (actuelle) | Redondante avec K-head, overfitting |
| Augmentation du nombre de heads (>16) | Depasse la dim intrinseque des embeddings |
| Architectures plus profondes | Dataset trop petit pour plus de parametres |
| Dropout agressif (>0.3) | Degrade la capacite deja limitee |
| Knowledge distillation | Pas de modele "teacher" disponible |

### 7.3 Direction de recherche a moyen terme

**Metric Learning avec Triplet Loss + Semi-Hard Mining**

Au lieu de l'InfoNCE actuelle, envisager une Triplet Loss avec semi-hard negatives :
```
L = max(0, d(anchor, positive) - d(anchor, negative) + margin)
```

Ou l'anchor est l'intent, le positif est l'outil correct, et le negatif semi-hard est l'outil mal classe le plus proche *mais pas trop proche*. Cette approche :
- N'ajoute pas de parametres
- Focus les gradients sur les cas marginaux
- Fonctionne bien avec de petits datasets

---

## 8. Conclusion

L'ajout d'une projection head au SHGAT-TF est theoriquement non motive et empiriquement sans effet. Les conditions necessaires pour qu'une projection head soit benefique -- apprentissage self-supervised, augmentations de donnees, grand dataset, grand vocabulaire, representations brutes (non pre-entrainees) -- sont toutes absentes de notre cas d'usage.

Le K-head scorer avec 16 heads x 64D est deja un mecanisme de projection multi-vues puissant. Les 361 exemples d'entrainement sont le vrai goulot d'etranglement, pas la capacite du modele. Chaque parametre supplementaire aggrave le risque d'overfitting sans ameliorer la generalisation.

Les efforts devraient se concentrer sur :
1. **L'augmentation de donnees** (paraphrases, bruit) pour mieux exploiter le K-head existant
2. **La regularisation structurelle** (orthogonalite des heads, temperature adaptative) pour forcer la diversite
3. **Le hard negative mining adaptatif** pour cibler les confusions reelles entre outils proches
4. **La collecte de plus de traces** (118 -> 500+) pour fournir plus de signal au modele

La projection head peut etre retiree sans perte de performance. Le code dans `projection-head.ts` peut etre conserve pour reference mais desactive par defaut.

---

## References

- Chen, T., Kornblith, S., Norouzi, M., & Hinton, G. (2020). "A Simple Framework for Contrastive Learning of Visual Representations" (SimCLR). ICML 2020.
- Radford, A., Kim, J.W., et al. (2021). "Learning Transferable Visual Models From Natural Language Supervision" (CLIP). ICML 2021.
- Chen, X., Fan, H., Girshick, R., & He, K. (2020). "Improved Baselines with Momentum Contrastive Learning" (MoCo v2). arXiv:2003.04297.
- Gupta, K., Tajanthan, T., et al. (2022). "Understanding and Improving the Role of Projection Head in Self-Supervised Learning". arXiv:2212.11491.
- Liu, Z., et al. (2025). "Projection Head is Secretly an Information Bottleneck". ICLR 2025. arXiv:2503.00507.
- Wen, Z. & Li, Y. (2023). "Unraveling Projection Heads in Contrastive Learning: Insights from Expansion and Shrinkage". arXiv:2306.03335.
- Zhuo, Z., et al. (2024). "Overfitting in Contrastive Learning?". arXiv:2407.15863.
- Velickovic, P., et al. (2018). "Graph Attention Networks" (GAT). ICLR 2018.
- Li, Y., et al. (2024). "Multi-head multi-order graph attention networks". Applied Intelligence.
- Tishby, N. & Zaslavsky, N. (2015). "Deep Learning and the Information Bottleneck Principle". ITW 2015.

---

## Fichiers impactes

| Fichier | Action recommandee |
|---------|-------------------|
| `lib/shgat-tf/src/core/projection-head.ts` | Conserver, desactiver par defaut |
| `lib/shgat-tf/src/core/types.ts` | `useProjectionHead` deja `false` par defaut |
| `lib/shgat-tf/src/attention/khead-scorer.ts` | Pas de modification necessaire |
| `lib/shgat-tf/src/training/autograd-trainer.ts` | Le code de projection head peut rester, juste ne pas activer |
| `lib/gru/src/transition/gru-model.ts` | Aucune modification |
