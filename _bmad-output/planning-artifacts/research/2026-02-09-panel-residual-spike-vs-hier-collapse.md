# Panel d'Experts : Croisement Spike PerLevel (23 jan) x Collapse SHGAT-Hier (9 fev)

**Date**: 2026-02-09
**Format**: Panel de 3 experts ML en debat contradictoire
**Documents croises**:
- Rapport d'equipe 2026-02-09 : `_bmad-output/planning-artifacts/research/2026-02-09-shgat-hier-aggregation-strategies.md`
- Spike PerLevel 2026-01-23 : `_bmad-output/planning-artifacts/spikes/2026-01-23-spike-per-level-residual.md`
**Code examine**:
- `lib/shgat-tf/src/core/forward-helpers.ts` (residual connections)
- `lib/shgat-tf/src/core/types.ts` (config defaults)
- `lib/shgat-tf/src/message-passing/multi-level-orchestrator.ts` (bug lignes 488 vs 787)
- `lib/shgat-tf/src/core/builder.ts` (ArchitectureOptions)
- `lib/shgat-tf/benchmark/src/run-livemcp.ts` (benchmark runner)

---

## Panelistes

- **Expert A (Theo)** -- Theoricien, specialiste optimisation et espace des representations
- **Expert B (Vera)** -- Praticienne ML systemes, specialiste inference sans entrainement
- **Expert C (Hassan)** -- Ingenieur systeme, specialiste debugging et pipelines de production

---

## Question 1 : Les alphas appris du spike sont-ils transferables comme valeurs fixes dans un setup no-training ?

### Expert A (Theo)

Non, pas directement. Les alphas appris dans le spike (L0=0.986, L1=0.167, L2=0.281 pour PL@Final seul) sont le resultat d'une co-optimisation entre les parametres d'attention et les logits residuels. L'attention apprise oriente le signal de message passing de maniere discriminante -- les alphas s'ajustent en complement. Sans entrainement, l'attention est aleatoire (Xavier random), donc le signal de message passing est fondamentalement different. Un alpha de 0.167 pour L1 signifie "laisser passer 83% du signal MP" -- mais ce signal MP etait utile quand l'attention etait entrainee. En Option A, 83% de bruit aleatoire dilue va corrompre l'embedding.

**Verdict**: Les ratios relatifs (L0 >> L2 > L1) sont informatifs, mais les valeurs absolues ne sont pas transferables.

### Expert B (Vera)

Partiellement d'accord avec Theo, mais je nuance. L'insight structural du spike reste valide : les feuilles (L0) doivent etre protegees beaucoup plus que les noeuds intermediaires. La raison est geometrique, pas liee a l'entrainement : les embeddings L0 sont les seuls a porter un signal semantique discriminant (BGE-M3). Les embeddings L1/L2 sont des moyennes -- ils sont deja dilues a l'initialisation. Le MP ne peut que les ameliorer (ou les degrader). La question n'est pas "quel alpha exact" mais "quel regime" :

- **L0** : alpha tres eleve (0.95+). Le MP descendant ne peut qu'ajouter du bruit sans attention entrainee.
- **L1/L2** : alpha moderement eleve (0.7-0.8). Les embeddings moyens ne perdent pas grand-chose avec un peu de MP, meme aleatoire, car ils sont deja non-discriminants.

Mais attention : les alphas du spike PL@Down+Final (L0=1.00, L1=0.85, L2=0.32) sont plus pertinents pour notre cas. Ils montrent que quand le residual est applique DANS le downward pass (pas seulement en post-MP), L0 converge vers 1.0 (= ignorer completement le MP descendant). C'est exactement ce que l'Option A devrait faire.

### Expert C (Hassan)

Le probleme pratique est different. Regardons ce que le code fait reellement. Il y a DEUX residuals empiles :

1. `downwardResidual` dans `multi-level-orchestrator.ts:488` -- applique PENDANT le downward pass
2. `preserveDimResidual(s)` dans `forward-helpers.ts:407-418` -- applique APRES le MP complet

Le spike a teste le residual en position "Final" (preserveDimResiduals) et "Down" (downwardResidual). Les alphas PL@Down+Final correspondent a l'application DANS les deux positions simultanement. On ne peut pas juste prendre ces valeurs et les coller en config parce que :

- `downwardResidual` dans `forwardMultiLevel` est un scalaire global (pas per-level)
- `preserveDimResiduals` est bien per-level mais il n'y a pas de `downwardResiduals` per-level dans le code actuel

**Conclusion du panel sur Q1**: Les valeurs absolues ne sont pas transferables, mais le pattern qualitatif l'est. L'insight cle est : **L0 doit etre protege a quasi-100%, et le MP descendant doit etre fortement attenue en no-training**. Les valeurs du spike PL@Down+Final (L0=1.0, L1=0.85, L2=0.32) definissent une borne superieure pour `preserveDimResiduals` en Option A, avec un decalage vers des valeurs plus conservatrices (plus proches de 1.0 pour tous les niveaux).

---

## Question 2 : downwardResidual global vs PerLevel -- que recommandent les experts ?

### Expert A (Theo)

Le rapport d'aujourd'hui propose un sweep de `downwardResidual` de 0.0 a 1.0 (Quick Win A). C'est un scalaire global. Le spike montre que PerLevel est strictement superieur a un scalaire global (LearnableScalar collapse, PerLevel stable). Cependant, le contexte est different :

- Le spike : LearnableScalar apprend mal (collapse) vs PerLevel apprend bien
- Le rapport : pas d'apprentissage, valeurs fixes

Dans un setup no-training avec des valeurs fixes, un scalaire global bien choisi peut fonctionner. La question est : un seul alpha a 0.9 pour tous les niveaux est-il suffisant ?

Reponse : probablement oui pour un premier test. Avec `downwardResidual=0.9`, l'embedding L0 garde 90% de l'original. C'est sous-optimal (le spike dit que L0 devrait garder 100%) mais c'est un gain enorme par rapport a 0% actuel. Le gain marginal du per-level vs global fixe est probablement de l'ordre de 1-2pp R@1, pas du meme ordre que le gain de 0.0 a 0.9.

### Expert B (Vera)

Je suis plus tranchee. Le rapport a raison d'identifier `downwardResidual=0` comme le facteur critique (#4 dans le diagnostic). Mais la proposition de sweep est incomplete. Voici pourquoi :

Le `downwardResidual` dans `forwardMultiLevel` s'applique uniformement a TOUS les niveaux. Avec alpha=0.9 :
- L0 tools : garde 90% original -- correct
- L1 servers : garde 90% de l'embedding mean-pooled -- inutile (cet embedding est deja faible)
- L2 categories : garde 90% de l'embedding mean-pooled -- meme probleme

Ce qu'on veut reellement : proteges L0, laisse L1/L2 etre modifies par le MP (meme aleatoire) car leurs embeddings de depart sont des moyennes peu informatives. Un alpha global eleve empeche le MP d'ameliorer L1/L2, ce qui reduit le potentiel de la hierarchie.

**Ma recommandation**: Commencer par le sweep global (5 min de travail), mais preparer immediatement la config per-level.

### Expert C (Hassan)

Point technique crucial : `preserveDimResiduals` est DEJA implemente et fonctionne en config-only. Voir `forward-helpers.ts:409-415` :

```typescript
} else if (ctx.config.preserveDimResiduals && ctx.config.preserveDimResiduals.length > 0) {
  const E_levels = ctx.graphBuilder.getCapabilityLevels();
  const H_levels = ctx.graphBuilder.getToolLevels();
  E_flat = applyResidualConnectionPerLevel(E_flat, E_original, E_levels, ctx.config.preserveDimResiduals, defaultResidual);
  H_final = applyResidualConnectionPerLevel(H_final, H_original, H_levels, ctx.config.preserveDimResiduals, defaultResidual);
}
```

Mais `downwardResidual` dans `forwardMultiLevel` (ligne 488) est un scalaire unique. Il n'y a PAS de `downwardResiduals[]` per-level dans le code actuel. Donc :

- `preserveDimResiduals` per-level : disponible, zero code requis
- `downwardResidual` per-level : non disponible, necessite modification du code

Le probleme : `preserveDimResiduals` s'applique APRES le MP complet. Si le downward a deja ecrase les embeddings L0 (avec `downwardResidual=0`), meme un `preserveDimResiduals[0]=0.99` ne suffira pas car le MP a deja "pollue" les embeddings tools. La combinaison des deux residuals est multiplicative en termes de protection :

```
protection_effective = 1 - (1 - downwardResidual) * (1 - preserveDimResidual)
```

Avec downwardResidual=0 et preserveDimResiduals[0]=0.99 : protection = 0.99 (OK pour L0)
Avec downwardResidual=0 et preserveDimResiduals[0]=0.3 : protection = 0.3 (insuffisant)

Donc **meme sans toucher downwardResidual**, on peut obtenir un bon resultat en utilisant `preserveDimResiduals = [0.95, 0.7, 0.5]`.

**Consensus du panel sur Q2**: Le sweep de `downwardResidual` global est un bon premier test rapide. Mais `preserveDimResiduals` per-level est la vraie solution et elle est deja implementee. La recommandation prioritaire est :

1. **Test immediat** : `preserveDimResiduals = [0.95, 0.7, 0.5]` avec `downwardResidual = 0` (zero code, config only)
2. **Si insuffisant** : `downwardResidual = 0.8` + `preserveDimResiduals = [0.95, 0.5, 0.3]`
3. **Idealement** : ajouter `downwardResiduals[]` per-level dans le code (modification mineure de `forwardMultiLevel`)

---

## Question 3 : Le bug forwardMultiLevel vs forwardMultiLevelWithCache -- quelle formulation est correcte ?

### Expert A (Theo)

La formulation mathematique originale dans les papiers GAT est additive avec residual :

```
H' = H + sigma(attention(H))
```

C'est un "skip connection" a la ResNet. La formulation dans `forwardMultiLevelWithCache` (ligne 787) :
```typescript
row.map((val, j) => val + (E_concat[i]?.[j] ?? 0))
```

est exactement cela : `E_new = E_original + E_propagated`. C'est la formulation standard.

La formulation dans `forwardMultiLevel` (ligne 488) :
```typescript
(1 - alpha) * propagated + alpha * original
```

est un "weighted blend" ou "convex combination". C'est une generalisation (si alpha=0, pas de residual ; si alpha=1, skip le MP).

**Les deux sont valides mathematiquement** mais elles ont des semantiques differentes :
- Additive (forwardMultiLevelWithCache) : le MP ajoute un delta a l'original. Peut amplifier la norme.
- Blend (forwardMultiLevel) : le MP remplace partiellement l'original. La norme reste bornee.

### Expert B (Vera)

Le vrai probleme n'est pas "quelle formulation est correcte" mais "les deux chemins de code doivent etre coherents". C'est un bug pur et simple. Le training utilise `forwardMultiLevelWithCache` (additif), l'inference/benchmark utilise `forwardMultiLevel` (blend). Un modele entraine avec la formulation additive sera evalue avec une formulation differente -- les resultats seront incoherents.

Pour Option A (no-training), le choix de formulation importe moins car il n'y a pas de train/eval mismatch. Mais pour le futur (Phase 4 du rapport), ce bug est bloquant.

### Expert C (Hassan)

Regardons le code exactement.

**forwardMultiLevel** (lignes 486-494) -- utilise par le benchmark :
```typescript
const alpha = config.downwardResidual ?? 0;  // DEFAULT 0
const E_new = capsAtLevelPreDownward.map((row, i) =>
  row.map((val, j) => {
    const propagated = E_concat[i]?.[j] ?? 0;
    return (1 - alpha) * propagated + alpha * val;  // blend
  })
);
```
Avec alpha=0 : `E_new = propagated` (100% remplacement)

**forwardMultiLevelWithCache** (lignes 787-789) -- utilise par le training :
```typescript
const E_new = capsAtLevelPreDownward.map((row, i) =>
  row.map((val, j) => val + (E_concat[i]?.[j] ?? 0))  // addition pure
);
```
Resultat : `E_new = original + propagated` (additive, pas de poids)

Et la meme chose pour le E->V final, lignes 544-549 vs 826 :
- `forwardMultiLevel:544` : `(1 - alpha) * propagated + alpha * val` (blend)
- `forwardMultiLevelWithCache:826` : `val + (H_concat[i]?.[j] ?? 0)` (addition pure)

**Impact concret** : avec le alpha par defaut de 0 :
- Benchmark : `E_new = 1.0*propagated + 0.0*original = propagated` => ECRASEMENT TOTAL
- Training : `E_new = original + propagated` => ADDITION (residual implicite)

Le training n'a jamais souffert du collapse parce que `forwardMultiLevelWithCache` a un residual additif IMPLICITE. Le benchmark collapse parce que `forwardMultiLevel` n'a aucun residual quand alpha=0.

**Consensus du panel sur Q3** : C'est un **bug confirme** avec un impact direct sur le collapse observe. La correction doit :

1. **Aligner les deux formulations**. La cible devrait etre la formulation blend (celle de `forwardMultiLevel`) car elle est plus controllable et permet alpha=1.0 (= skip le MP).
2. **Corriger `forwardMultiLevelWithCache`** pour utiliser la meme formule `(1-alpha)*propagated + alpha*original`.
3. **Apres correction** : les resultats de training passeront eux aussi par le downwardResidual configurable. Cela signifie que les anciens resultats de training (spike du 23 jan) etaient en fait obtenus avec un residual additif implicite (alpha effectif indefini car addition, pas blend). Cela relativise encore plus la transferabilite des alphas appris.

---

## Question 4 : Que faut-il faire concretement pour le benchmark LiveMCPBench ?

### Plan d'action consensuel du panel

#### Etape 0 : Exposer les parametres dans le builder et le benchmark (30 min)

Le `ArchitectureOptions` dans `builder.ts:142` n'expose pas `downwardResidual`, `preserveDimResidual`, ni `preserveDimResiduals`. Le benchmark `run-livemcp.ts:222` appelle `.build()` sans aucune architecture option.

**Actions** :
1. Ajouter a `ArchitectureOptions` :
   ```typescript
   downwardResidual?: number;
   preserveDimResidual?: number;
   preserveDimResiduals?: number[];
   ```
2. Propager ces options dans le builder vers la config SHGAT.
3. Dans `run-livemcp.ts:222`, passer les options :
   ```typescript
   const scorer = await SHGATBuilder.create()
     .nodes(nodes)
     .architecture({
       downwardResidual: DR,
       preserveDimResiduals: PDR,
     })
     .build();
   ```

#### Etape 1 : Sweep preserveDimResiduals per-level (config-only, 15 min par run)

Le residual per-level post-MP est deja implemente. C'est le quick win le plus sur.

| Run | `downwardResidual` | `preserveDimResiduals` | Prediction R@1 |
|-----|-------------------|----------------------|---------------|
| 1.1 | 0 (defaut) | [0.95, 0.7, 0.5] | ~12-14% |
| 1.2 | 0 (defaut) | [0.99, 0.5, 0.3] | ~14-16% |
| 1.3 | 0 (defaut) | [1.0, 0.5, 0.3] | ~15-16% |
| 1.4 | 0 (defaut) | [0.3] (defaut actuel) | 3.4% (baseline collapse) |

**Logique** : Le `preserveDimResiduals[0]=0.99` protege les tools L0 presque totalement. Le MP descendant ecrase les embeddings, mais le residual post-MP restaure 99% de l'original. C'est equivalent a `downwardResidual=0.99` mais applique au bon endroit.

#### Etape 2 : Sweep downwardResidual global (15 min par run)

| Run | `downwardResidual` | `preserveDimResiduals` | Prediction R@1 |
|-----|-------------------|----------------------|---------------|
| 2.1 | 0.9 | [0.3] (defaut) | ~14-15% |
| 2.2 | 0.95 | [0.3] (defaut) | ~15% |
| 2.3 | 1.0 | [0.3] (defaut) | ~15.9% (= SHGAT-Flat) |

**Prediction** : `downwardResidual=1.0` revient a ignorer le MP descendant completement. Le resultat devrait converger vers SHGAT-Flat car le MP n'a aucun effet.

#### Etape 3 : Combinaison optimale (si Etape 1 ou 2 depasse cosine)

| Run | `downwardResidual` | `preserveDimResiduals` | Prediction R@1 |
|-----|-------------------|----------------------|---------------|
| 3.1 | 0.8 | [0.95, 0.5, 0.3] | ~15-17% (objectif) |
| 3.2 | 0.7 | [0.95, 0.5, 0.3] | ~14-16% |
| 3.3 | 0.5 | [0.95, 0.5, 0.3] | ~12-15% |

**L'objectif** : trouver le downwardResidual qui laisse passer JUSTE ASSEZ de signal hierarchique pour enrichir sans corrompre, combine avec un preserveDimResiduals qui protege les L0 en dernier ressort.

#### Etape 4 (optionnelle) : Corriger le bug

Si les resultats des etapes 1-3 sont prometteurs et qu'on envisage un training leger (Phase 4 du rapport original), corriger l'inconsistance `forwardMultiLevelWithCache` pour utiliser la formule blend.

### Critere de succes

| Palier | R@1 | Verdict |
|--------|-----|---------|
| Minimum | >= 14.4% | Egalise cosine -- le hier ne degrade plus |
| Cible | >= 16% | Depasse SHGAT-Flat (+0.1pp) -- le hier ajoute de la valeur |
| Excellent | >= 18% | Gain significatif justifiant la complexite |

---

## Question 5 : V2V seul est instable (spike) mais le rapport propose V2V siblings (Strategy B) -- contradiction ?

### Expert A (Theo)

Pas de contradiction, mais un risque important. Le spike montre que "PL@V2V" (PerLevel applique uniquement au V2V) est instable : peak a 54% epoch 5, crash a 21.6% epoch 15. Mais c'est dans un contexte d'ENTRAINEMENT ou les parametres V2V apprenables divergent.

La proposition "V2V siblings" du rapport est fondamentalement differente : elle utilise le V2V comme enrichissement PRE-MP avec des poids FIXES (residual configurable, pas de parametres apprenables). Dans un setup no-training, le V2V ne peut pas diverger -- il applique un enrichissement statique base sur la co-occurrence structurelle.

### Expert B (Vera)

D'accord avec Theo sur le fond, mais le probleme pratique demeure. Le V2V en Option A utilise les memes parametres d'attention aleatoires que le MP. L'enrichissement sera :

```
H_enriched = (1-r) * attention_random(H, cooccurrence) + r * H
```

Avec l'attention aleatoire, `attention_random(H, cooccurrence)` produit une moyenne ponderee quasi-uniforme des co-occurrents. C'est un smoothing spatial qui REDUIT la discriminabilite des embeddings tools, exactement comme le mean pooling pour les parents.

La seule facon dont le V2V pourrait aider en no-training est si la structure de co-occurrence est elle-meme informative (tools du meme serveur sont semantiquement proches). Mais alors, l'information est deja dans les embeddings BGE-M3 -- un tool "database_query" est deja proche de "database_insert" en cosine.

### Expert C (Hassan)

Le code V2V (`vertex-to-vertex-phase.ts`) utilise des parametres apprenables : `residualWeight`, `useAttention`, `temperature`. En no-training, ces parametres sont a leur initialisation par defaut. Le `v2vResidual` dans la config est a 0 par defaut (desactive).

Meme si on l'active avec `v2vResidual=0.3`, le V2V phase ajoute de la complexite et du bruit sans entrainement. Le rapport original le classe correctement en Phase 3 (apres les quick wins).

**Consensus du panel sur Q5** : Pas de contradiction au sens strict, mais **le V2V sans entrainement a tres peu de chances d'aider et risque d'ajouter du bruit**. La priorite reste les quick wins sur les residuals (Phase 1). Le V2V ne devrait etre teste qu'apres avoir stabilise le hier avec les residuals, et seulement si on a un mecanisme d'attention non-aleatoire (ex: attention basee sur la similarite cosine des embeddings, pas Xavier random).

---

## Synthese et Recommandations Finales

### Ce que le panel retient de la confrontation des 2 documents

1. **Le collapse est un bug de configuration, pas un defaut architectural.** Le `downwardResidual=0` par defaut ecrase les embeddings tools. Le spike avait un residual additif implicite dans `forwardMultiLevelWithCache` qui masquait le probleme pendant le training.

2. **Le spike valide que PerLevel est la bonne approche.** Meme si les valeurs absolues ne sont pas transferables, le pattern L0>>L1>=L2 est robuste et s'applique au no-training.

3. **Le bug d'inconsistance entre les deux forward paths est critique.** Il explique pourquoi le training semblait fonctionner alors que l'inference collapse. Ce bug doit etre corrige, mais il n'est pas bloquant pour les quick wins imminents.

4. **Le V2V est premature.** Le spike confirme son instabilite, et le no-training la rend encore plus problematique.

### Recommandation de configuration pour le premier run

```typescript
const scorer = await SHGATBuilder.create()
  .nodes(nodes)
  .architecture({
    // Proteger les tools L0 a 95%, laisser L1/L2 beneficier un peu du MP
    preserveDimResiduals: [0.95, 0.6, 0.4],
    // Proteger aussi dans le downward pass lui-meme
    downwardResidual: 0.85,
  })
  .build();
```

### Recommandation de sweep systematique (6 runs prioritaires)

| # | `downwardResidual` | `preserveDimResiduals` | Hypothese |
|---|-------------------|----------------------|-----------|
| 1 | 0 | [0.95, 0.7, 0.5] | PerLevel seul suffisant ? |
| 2 | 0 | [0.99, 0.5, 0.3] | L0 quasi-parfait, MP libre pour L1/L2 |
| 3 | 0.85 | [0.3] (defaut) | downwardResidual global suffisant ? |
| 4 | 0.95 | [0.3] (defaut) | downwardResidual agressif |
| 5 | 0.85 | [0.95, 0.5, 0.3] | Combinaison double residual |
| 6 | 1.0 | [0.3] (defaut) | Controle : equivaut a SHGAT-Flat |

**Run 6 est le controle critique** : si `downwardResidual=1.0` donne exactement le meme R@1 que SHGAT-Flat (15.9%), cela confirme que le MP est le seul facteur de degradation. Si le MP est desactive et le score differe, il y a un autre facteur en jeu.

### Risques identifies

| Risque | Probabilite | Impact | Mitigation |
|--------|-------------|--------|------------|
| `ArchitectureOptions` ne propage pas `preserveDimResiduals` au config | Eleve | Bloquant | Verifier builder.ts build() |
| `preserveDimResiduals` indexe par level dans forward-helpers mais le benchmark a des levels 0/1/2 et les tools sont level=0 | Moyen | Faux resultats | Valider que `getCapabilityLevels()` et `getToolLevels()` retournent les bons indices pour la hierarchie LiveMCP |
| Le residual post-MP dans forward-helpers utilise `(1-r)*propagated + r*original` avec L2 norm. La normalisation peut masquer l'effet du residual | Faible | Gain attenue | Tester avec et sans norm |

### Prochaines etapes en ordre de priorite

1. **P0 (30 min)** : Ajouter `downwardResidual`, `preserveDimResidual`, `preserveDimResiduals` a `ArchitectureOptions` et les propager dans le builder
2. **P0 (1h)** : Executer les 6 runs du sweep
3. **P1 (30 min)** : Corriger le bug `forwardMultiLevelWithCache` pour utiliser la formulation blend avec `downwardResidual`
4. **P2 (si les runs montrent un gain)** : Ajouter `downwardResiduals[]` per-level dans `forwardMultiLevel` pour une granularite complete
5. **P3 (si les runs stagnent a Flat)** : Considerer la strategie "hierarchy as edges only" (section 3.6 du rapport)

---

## Annexe : Correspondance des parametres entre le spike et le code actuel

| Concept spike | Parametre config actuel | Fichier | Statut |
|---------------|------------------------|---------|--------|
| PL@Final | `preserveDimResiduals: number[]` | `types.ts:237` | Implemente |
| PL@Down | `downwardResidual: number` (global) | `types.ts:252` | Implemente (global seulement) |
| PL@V2V | `v2vResidual: number` (global) | `types.ts:245` | Implemente (global, non per-level) |
| alpha_L0, L1, L2 | `preserveDimResiduals[0], [1], [2]` | `forward-helpers.ts:409-415` | Implemente |
| Downward per-level | NON EXISTANT | - | A implementer si necessaire |
| Learnable logits | `residualLogits` dans `ForwardPassContext` | `forward-helpers.ts:384-408` | Implemente (training only) |

---

*Rapport genere par un panel de 3 experts ML (simulation). Les recommandations sont basees sur l'analyse croisee du spike du 2026-01-23 et du rapport de collapse du 2026-02-09, confrontee au code source actuel.*
