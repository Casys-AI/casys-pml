# Tech Spec — engine.casys.ai v2

**Date**: 2026-02-28
**Auteur**: David Aames
**Status**: In Progress (pages + deep dives déployés, narratif en cours de resserrement)

---

## Vision

Transformer la page `/engine` en **site de data art pour ML/data scientists**. Le sujet : un pipeline SHGAT + GRU qui prédit le prochain nœud d'exécution pour agents IA — sans LLM, sans GPU, sans API.

L'esthétique cible : **Information is Beautiful**, **Nadieh Bremer**, **Flowing Data** — les visualisations racontent l'histoire, le texte est minimal et précis.

---

## Narratif central : deux systèmes, un espace commun

**Le sujet n'est pas "comment on a entraîné un modèle". C'est : comment deux systèmes complémentaires partagent un espace géométrique pour faire quelque chose qu'aucun des deux ne pourrait faire seul.**

### Acte 1 — SHGAT : le graphe qui enrichit l'espace

SHGAT (Structured Heterogeneous Graph Attention) est un **GNN qui opère sur un hypergraphe d'exécution**. Pas un graphe de co-occurrences — un hypergraphe où :

- Les **leaf nodes (L0)** sont les actions atomiques (920)
- Les **parent nodes (L1)** sont des groupements fonctionnels — chacun *représente* un sous-ensemble de leaf nodes qui co-exécutent régulièrement (245)
- Les **arêtes** encodent des relations d'appartenance, pas de simple voisinage

Le message passing SHGAT enrichit les embeddings BGE-M3 : les nodes qui co-exécutent se rapprochent dans l'espace, les parent nodes transmettent leur contexte fonctionnel vers le bas. Résultat : un espace géométrique qui reflète **l'usage**, pas la description textuelle.

**Ce que SHGAT apporte** : la géométrie de l'espace est déjà structurée avant que le GRU n'entre en jeu.

### Acte 2 — GRU : la séquence dans l'espace enrichi

Le GRU (Gated Recurrent Unit) prédit le **prochain nœud dans une séquence d'exécution**. Il opère sur le **même vocabulaire** que SHGAT — leaf nodes et parent nodes confondus — et ses inputs à chaque étape sont les embeddings SHGAT (pas les raw embeddings).

Le GRU n'apprend pas la structure du graphe : il l'hérite. Il peut donc se concentrer entièrement sur la dynamique de séquence. C'est le couplage qui crée la valeur.

**Ce que le GRU apporte** : prédiction de séquence qui exploite une géométrie déjà contrainte par l'usage réel.

### La phrase clé du narratif

> SHGAT structure the space. GRU navigates it.

---

## Notes éditoriales

### Sur les 258K paramètres

À garder comme **stat de support**, pas comme hero. Le nombre seul ne dit rien — ce qui dit quelque chose c'est : "un modèle aussi petit peut performer ainsi *parce qu'il part d'embeddings déjà structurés*." Le message est l'efficacité conditionnelle à la géométrie SHGAT, pas l'efficacité absolue.

Si on l'utilise en headline : "258K parameters. Zero LLM calls." — la contrapositive (pas de LLM) est plus frappante que le nombre.

### Sur le vocabulaire "node"

Ne jamais dire "tool" ou "capability" isolément. Dire **"node"**, qualifier avec le niveau :

| Interne | Public |
|---------|--------|
| tool | leaf node / L0 |
| capability | parent node / L1 |
| tool vocab + caps | unified node vocabulary |
| SHGAT enrichment | graph attention enrichment |
| tool Hit@1 | leaf Hit@1 |
| cap Hit@1 | parent Hit@1 |

### Sur les dead ends et la recherche

Les deep dives *peuvent* raconter les échecs (NB-03, NB-18, NB-23/24). Mais la page principale doit rester **thesis-first** — on montre ce qu'on a construit, pas comment on a tâtonné. Les hésitations et pivots appartiennent aux deep dives, pas au scroll principal.

---

## Dataset de référence synthétique (future work)

**NB-01 (MP Toy Problem)** utilise un benchmark synthétique : 512 tools, **7 niveaux de hiérarchie**, contrôlé. C'est exactement le type de benchmark qui permet de valider des hypothèses isolément (séparément des effets de distribution réelle).

Pour les futurs notebooks sur SHGAT/GRU, ce dataset (ou une variante) devrait être utilisé comme **benchmark de référence contrôlé** avant de valider sur données réelles. Cela permettrait notamment de :
- Tester l'impact du message passing par niveau de hiérarchie
- Isoler l'effet de la profondeur (L0 vs L1 vs L2 vs … vs L7)
- Mesurer la dégradation de performance par scaling du vocab

Le dataset n8n (38K workflows) est trop bruité (60% Smithery, 2.9% overlap avec prod) pour servir de base de validation propre.

---

## Concept fondateur : Tout est node

Le modèle est **hiérarchique et récursif**. Il n'y a pas de "tools" et de "capabilities" — il y a des **nodes à N niveaux** :

| Niveau | Description | Vocabulaire page | Exemples |
|--------|-------------|------------------|----------|
| L0 | Leaf node (feuille) | leaf / action | `psql_query`, `read_file` |
| L1 | Parent node | group / pattern | `database-ops`, `file-management` |
| L2 | Meta node | composition | `data-pipeline`, `deploy-flow` |
| Ln | Récursif | hierarchy level n | Arbitraire |

La formule résiduelle (`E_new[c] = ELU(Σα·H') + γ(n_c)·E[c]`) s'explique naturellement dans ce cadre : un node avec peu d'enfants garde son identité, un node avec beaucoup d'enfants se laisse réécrire par son voisinage. **Récursion structurelle, pas heuristique.**

---

## Architecture site

### Page principale `/engine`

Parcours visuel linéaire. Scroll storytelling. Les hero plots dominent, le texte est secondaire.

```
HERO
  ↓
The Graph — hypergraphe d'exécution, structure hiérarchique
  ↓
Raw ≠ Ready — t-SNE avant/après enrichissement SHGAT
  ↓
Message Passing — pourquoi contrastif > smoothing (NB-01)
  ↓
Residual — apprendre le bon ratio d'identité (γ adaptatif)
  ↓
Sequence — GRU prédit dans l'espace SHGAT
  ↓
Results — pipeline complet, stats finales
  ↓
DEEP DIVES — liens vers les 5 pages de détail
  ↓
CODA
```

### Deep dives `/engine/deep/{slug}`

5 pages dédiées, URL partageable. Toutes les visualisations du groupe.

| Slug | Titre | Notebooks | Narrative |
|------|-------|-----------|-----------|
| `data-quality` | The Data Quality Odyssey | NB-05, 09, 19, 20 | "Meilleure donnée > meilleur modèle" |
| `node-hierarchy` | Nodes All The Way Down | NB-11, 13, 17, 21, 22 | "Un vocabulaire unifié leaf+parent" |
| `residual-engineering` | Two Parameters, +22.7pp | NB-12, 14, 15, 16 | "Le modèle apprend à presque ne pas agréger" |
| `dead-ends` | What Didn't Work | NB-03, 04, 18, 23, 24 | "5 idées prometteuses sur papier, 0 survivent aux données" |
| `scaling` | Scaling & Retrieval | NB-01, 02 | "Théorie fondatrice avant les données réelles" |

---

## Visualisation : Style Guide

### Thème Casys Seaborn

```python
import seaborn as sns
import matplotlib.pyplot as plt

sns.set_theme(
    style="whitegrid",
    font_scale=1.15,
    rc={
        'figure.facecolor': '#ffffff',
        'axes.facecolor':   '#faf1f6',
        'axes.edgecolor':   '#cfc3cd',
        'axes.labelcolor':  '#1e1a1e',
        'text.color':       '#1e1a1e',
        'xtick.color':      '#4d444c',
        'ytick.color':      '#4d444c',
        'grid.color':       '#e8dfe6',
        'grid.alpha':       0.6,
        'grid.linewidth':   0.5,
        'legend.facecolor': '#ffffff',
        'legend.edgecolor': '#cfc3cd',
        'legend.framealpha': 0.9,
        'savefig.facecolor': '#ffffff',
        'savefig.dpi':       200,
        'figure.dpi':        150,
        'font.family':       'sans-serif',
        'axes.spines.top':   False,
        'axes.spines.right': False,
    }
)
sns.despine()

PRIMARY  = '#83468f'   # MD3 primary — violet
TEAL     = '#4ECDC4'   # Contrast — teal
WARM     = '#82524c'   # Tertiary — terre (dead ends, négatif)
MUTED    = '#988d97'   # Neutral — gris mauve (baseline, secondaire)
BLUE     = '#60a5fa'   # Info — bleu
GREEN    = '#4ade80'   # Success — vert
```

### Principes visuels

1. **Ink/data ratio maximal** — `sns.despine()` partout. Grilles discrètes.
2. **Labels intégrés** — Annoter directement sur le plot, pas dans une légende séparée.
3. **Palette restreinte** — PRIMARY pour le sujet, TEAL pour contraste, WARM pour les dead ends.
4. **Dark mode** — fond blanc `#ffffff` + CSS `filter: invert(1) hue-rotate(180deg)` automatique.
5. **Pas de titre matplotlib** — les titres sont dans le HTML (figcaption).

---

## Page principale — Sections

### HERO

- Subtitle : "How a graph attention network + sequence model outperforms embedding similarity — without an LLM."
- Stats : "920 leaf nodes · 245 parent nodes · <5ms inference"
- (258K params = stat secondaire, pas headline)

### Section 1 — The Graph

**Concept** : Un hypergraphe d'exécution, pas un graphe de similarité.

> 920 leaf nodes. 245 parent nodes. 875 edges from execution traces.
> This is not a similarity graph — it's a behavioral graph.

**Hero viz** : degree distribution refaite en seaborn (hub nodes annotés).
**SVG animé** : diagramme 3 niveaux existant — garder.
**Deep dive link** → `/engine/deep/node-hierarchy`

### Section 2 — Raw ≠ Ready

**Concept** : BGE-M3 est bon pour la sémantique, aveugle à l'usage. SHGAT corrige ça.

**Hero viz** : t-SNE avant/après (raw vs enrichi, coloré par L1 parent).
**Stat** : `K-NN co-group rate: 24% → 43% (+19pp)`
**Deep dive link** → `/engine/deep/data-quality`

### Section 3 — Message Passing

**Concept** : Le MP contrastif pousse les frères-et-sœurs dans des directions différentes — contrairement au smoothing GAT classique qui les rapproche.

**Hero viz** : NB-01 résultats (7 méthodes, R@1). Smoothing=WARM, Contrastif=PRIMARY.
**Citation** :
> Smoothing MP kills discrimination. Contrastive MP pushes siblings apart. NB-01 validated this on a synthetic 7-level, 512-node hierarchy before touching real data.

### Section 4 — Residual

**Concept** : Combien garder du signal original ? 2 paramètres apprenables, pas une heuristique fixée.

**Formule** : `E_new[c] = ELU(Σα·H') + γ(n_c)·E[c]` où `γ(n) = σ(a·log(n+1) + b)`
**Hero viz** : γ(n) appris = sigmoïde sur le nombre d'enfants.
**Stat punch** : `43.4% → 66.1% Hit@1 (+22.7pp)`
**Narrative arc** : "We thought aggregation was the answer. The model learned to barely aggregate."
**Deep dive link** → `/engine/deep/residual-engineering`

### Section 5 — Sequence

**Concept** : Le GRU prédit le prochain node dans l'espace SHGAT. Il hérite de la géométrie, il n'a pas à l'apprendre.

**5 inputs** : SHGAT embedding du node courant, intent embedding, level hiérarchique, position, edge features.
**Vocabulaire unifié** : 1,165 nodes (920 leaf + 245 parent) — le GRU peut prédire à N'IMPORTE quel niveau.
**Deep dive link** → `/engine/deep/dead-ends` (pour les approches abandonnées)

### Section 6 — Results

**Punchline** : `70.8%` E2E beam accuracy.
**Table** : GRU seul (64.6%) vs GRU + SHGAT (70.8%) — le +6.2pp est la contribution nette de SHGAT.

### Section 7 — Deep Dives

Grid 5 cartes avec thumbnails. Chaque carte = titre + mini-insight + notebooks couverts.

---

## Risques et décisions ouvertes

| Risque | Mitigation |
|--------|------------|
| Vocabulaire "node" peut confondre avec DOM nodes | Toujours qualifier : "graph node", "leaf node", "parent node" |
| 30+ images = page lourde | Lazy loading, pages séparées pour deep dives |
| NB-01 utilise données synthétiques | Explicit dans le texte : "validated on synthetic benchmark before real data" |
| Narratif "acte 1 / acte 2" trop linéaire | S'assurer que le lien SHGAT→GRU est explicite dès le hero |

---

## Non-goals

- **Pas d'interactivité JS** sur les plots (pas de D3). Images statiques = v2. Interactivité = v3.
- **Pas de i18n immédiate** pour les images (texte des plots reste EN).
- **Pas de refonte du code SHGAT/GRU** — juste la présentation.
- **Pas de nouveau benchmark** — on présente les résultats existants.
