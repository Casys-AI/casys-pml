# GraphRAG

> The knowledge graph powering PML's intelligence

## En bref

GraphRAG est la memoire de PML. Comme un assistant qui apprend de ses experiences, PML construit progressivement un reseau de connaissances sur vos outils et vos habitudes de travail. Plus vous utilisez PML, plus il devient efficace pour suggerer les bons outils au bon moment.

**Ce que cela vous apporte concretement :**
- Moins de temps a chercher les bons outils
- Des suggestions pertinentes basees sur votre historique
- Des workflows automatiquement optimises
- Une comprehension du contexte de votre projet

## What is GraphRAG?

**GraphRAG** (Graph Retrieval-Augmented Generation) combines graph databases with AI to enhance tool discovery and workflow suggestion.

### L'analogie du cerveau

Pensez au GraphRAG comme au cerveau de PML. Tout comme votre cerveau cree des connexions neuronales entre des concepts lies (par exemple, "cafe" vous fait penser a "matin"), PML cree des connexions entre les outils que vous utilisez ensemble.

Quand vous lisez un fichier puis l'analysez regulierement, PML "se souvient" que ces deux actions vont de pair. La prochaine fois que vous lisez un fichier similaire, PML vous suggerera spontanement l'analyse.

### Structure du graphe

PML builds a **knowledge graph** of:
- **Tools** (nodes) - Les outils individuels comme `read_file` ou `create_issue`
- **Relationships** (edges) - Les liens entre outils : "A precede B", "A necessite B"
- **Capabilities** (compound nodes) - Des motifs appris : "analyser un fichier JSON"
- **Usage patterns** (edge weights) - La force des habitudes : combien de fois ce chemin a ete emprunte

![Knowledge Graph](excalidraw:src/web/assets/diagrams/rag-graph.excalidraw)

## Nodes and Edges

### Nodes

Nodes represent entities:

| Node Type | Description | Example |
|-----------|-------------|---------|
| **Tool** | An MCP tool | `filesystem:read_file` |
| **Capability** | A learned pattern | `cap:file_to_issue` |
| **Server** | An MCP server | `filesystem`, `github` |

### Edges

Edges represent relationships:

| Edge Type | Meaning | Example |
|-----------|---------|---------|
| **sequence** | A then B | read → write |
| **contains** | A includes B | capability → tool |
| **dependency** | B needs A | parse → read |
| **alternative** | A or B | save_json ↔ write_file |

Each edge has:
- **Weight** - Strength of relationship (0.0 to 1.0)
- **Count** - How many times observed
- **Source** - Where it came from (template, inferred, observed)

## Algorithms

PML uses graph algorithms to extract intelligence. Voici la **matrice des algorithmes** selon le contexte :

### Vue d'ensemble : Quand utiliser quel algorithme

| Objet | Recherche active (intent) | Suggestion passive (contexte) |
|-------|---------------------------|-------------------------------|
| **Outil simple** | **Hybrid Search** | **Next Step Prediction** |
| | `α × semantic + (1-α) × graph` | `co-occurrence + Louvain + recency` |
| **Capability** | **Capability Match** | **Strategic Discovery** |
| | `semantic × successRate` | `toolsOverlap × spectralBoost` |

> **Note:** Le paramètre **α** (alpha) est calculé localement pour chaque outil via [Local Adaptive Alpha](../02-discovery/02-hybrid-search.md#local-adaptive-alpha-α---intelligence-contextuelle). Les outils bien connectés ont un alpha bas (graphe fiable), les outils isolés ont un alpha haut (sémantique domine).

**Approche additive** (outils) : Plus permissive, combine les signaux
**Approche multiplicative** (capabilities) : Plus stricte, un mauvais signal disqualifie

### PageRank

**PageRank** identifies the most important tools based on how many other tools connect to them.

**High PageRank** = Many tools depend on this one. Tools A and D below have high PageRank (many incoming edges).

![Graph Evolution](excalidraw:src/web/assets/diagrams/rag-graph-evolution.excalidraw)

Use: Boost important tools in search results.

### Louvain (Community Detection)

**Louvain** groups tools that frequently work together into communities.

![Community Clustering](excalidraw:src/web/assets/diagrams/emerge-clustering.excalidraw)

Use: Suggest related tools from the same community.

### Dijkstra (Shortest Path)

**Dijkstra** finds the optimal path between two tools.

```
Question: "How to get from read_file to create_issue?"

Answer: read_file → parse → extract_error → create_issue
        (shortest path weighted by edge confidence)
```

**Pondération des chemins :**
Le coût d'un edge est inversement proportionnel à sa qualité :
```
cost = 1 / (edge_type_weight × source_modifier)

Exemple:
  dependency/observed → cost = 1/(1.0×1.0) = 1.0  (chemin préféré)
  sequence/template   → cost = 1/(0.5×0.5) = 4.0  (chemin évité)
```

Use: Build optimal workflows between start and end tools.

### Adamic-Adar (Similarité par voisins communs)

**Adamic-Adar** mesure si deux outils partagent des "amis communs" dans le graphe.

```
AA(A, B) = Σ (edge_weight / log(|voisins(N)|))
           pour chaque voisin commun N

Plus deux outils ont de voisins communs spécifiques (peu connectés),
plus ils sont considérés comme similaires.
```

Use: Dans Hybrid Search, pour calculer le graph score.

### Next Step Prediction (Formule complète)

Pour prédire le prochain outil après une action :

```
score = co-occurrence × 0.6   // Historique direct A→B
      + communityBoost × 0.3  // Même cluster Louvain
      + recencyBoost × 0.1    // Utilisé récemment
      + pageRank × 0.1        // Importance globale
```

Use: Suggestions passives ("Vous pourriez aussi avoir besoin de...")

## Graph Updates

The graph is not static - it grows and adapts:

1. **New tools** → New nodes added
2. **Executions** → Edges strengthened
3. **New patterns** → New edges created
4. **Unused paths** → Edges weakened over time

## Ce que PML apprend au fil du temps

Voici des exemples concrets de ce que PML retient de vos interactions :

### Vos habitudes de developpement

**Scenario :** Vous travaillez regulierement sur une API REST.

PML observe que vous :
1. Lisez le fichier de routes (`read_file routes.js`)
2. Executez les tests (`run_tests api`)
3. Creez une pull request (`create_pr`)

Apres quelques iterations, PML comprend ce workflow et vous suggere automatiquement l'etape suivante.

### Votre ecosysteme d'outils

**Scenario :** Vous utilisez souvent GitHub avec Slack.

PML note que :
- Apres chaque `create_issue`, vous faites `notify_slack`
- Quand un `pr_merged` survient, vous postez sur `#releases`

Resultat : PML suggerera `notify_slack` des que vous creez une issue.

### Vos preferences

**Scenario :** Deux outils peuvent faire la meme chose.

Vous preferez `write_json` a `write_file` pour sauvegarder des donnees structurees.

PML remarque cette preference et privilegiera `write_json` dans ses suggestions futures.

### Votre contexte projet

**Scenario :** Dans un projet Python, vous utilisez toujours `pytest`.

PML associe ce projet a `pytest` plutot qu'a `jest` (pour JavaScript).

Quand vous ouvrez ce projet, PML adapte ses suggestions au contexte Python.

## Benefits of GraphRAG

### Comparaison avant/apres

| Sans GraphRAG | Avec GraphRAG |
|---------------|---------------|
| Search by text only | Search by text + relationships |
| Static suggestions | Adaptive suggestions |
| No context awareness | Understands tool ecosystems |
| Manual workflow building | Automatic workflow suggestion |

### Exemples concrets de gains

**Gain de temps :**
- Avant : 5 minutes pour trouver et assembler les bons outils
- Apres : 30 secondes avec les suggestions automatiques de PML
- Economie : 90% du temps de configuration

**Reduction d'erreurs :**
- Avant : Oubli frequent d'etapes dans les workflows complexes
- Apres : PML vous rappelle les etapes manquantes basees sur vos workflows precedents
- Resultat : Workflows plus fiables et reproductibles

**Decouverte d'outils :**
- Avant : Vous utilisez toujours les memes 10 outils familiers
- Apres : PML suggere des outils complementaires que vous ne connaissiez pas
- Benefice : Enrichissement progressif de votre boite a outils

**Onboarding :**
- Avant : Un nouveau developpeur doit apprendre tous les workflows manuellement
- Apres : PML suggere automatiquement les patterns utilises par l'equipe
- Impact : Integration plus rapide des nouveaux membres

## Next

- [Dependencies](./02-dependencies.md) - Types of relationships
- [Confidence Levels](./03-confidence-levels.md) - How reliability is tracked
