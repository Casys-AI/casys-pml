# Hybrid Search

> Combining semantic and graph-based search

## En bref

La recherche hybride améliore la recherche sémantique en tenant compte de l'expérience collective : quels outils sont souvent utilisés ensemble, lesquels réussissent le mieux, et lesquels sont au coeur des workflows courants. C'est comme demander conseil à la fois à un dictionnaire (sens des mots) et à un expert (expérience pratique).

**Résultat :** Vous trouvez non seulement les outils qui correspondent à votre requête, mais aussi ceux qui ont fait leurs preuves dans des situations similaires.

## Why Hybrid?

Semantic search finds tools by meaning. But meaning alone misses important signals:

- Which tools are **frequently used together**?
- Which tools have **high success rates**?
- Which tools are **central** to common workflows?

**Hybrid search** combines semantic similarity with graph-based signals for better results.

```
┌─────────────────┐         ┌─────────────────┐
│ Semantic Score  │         │  Graph Score    │
│                 │         │                 │
│ "How similar    │         │ "How important  │
│  is the meaning │    +    │  is this tool   │
│  to my query?"  │         │  in workflows?" │
└────────┬────────┘         └────────┬────────┘
         │                           │
         └─────────┬─────────────────┘
                   ▼
           ┌──────────────┐
           │ Final Score  │
           │ (weighted)   │
           └──────────────┘
```

### Analogie : Choisir un restaurant

Imaginez que vous cherchez "un bon restaurant italien" :

**Approche sémantique seule** (comme Google)
- Trouve tous les restaurants dont la description mentionne "italien"
- Ne sait pas lesquels sont réellement bons
- Résultat : beaucoup de choix, qualité variable

**Approche hybride** (comme Google + TripAdvisor + vos amis)
- Trouve les restaurants italiens (sémantique)
- Privilégie ceux avec de bonnes notes (graph : PageRank)
- Booste ceux que vos amis ont aimés (graph : usage)
- Suggère ceux du même quartier que votre dernier choix (graph : communauté)
- Résultat : les meilleurs restaurants italiens pour VOUS

C'est exactement ce que fait la recherche hybride : elle combine le sens de votre requête avec l'intelligence collective.

## Semantic Component

The semantic score comes from embedding similarity (see [Semantic Search](./01-semantic-search.md)):

- Query and tool descriptions are embedded
- Cosine similarity measures closeness
- Score range: 0.0 to 1.0

## Graph Component

The graph score comes from PML's knowledge graph:

### PageRank

Tools that are referenced by many other tools get higher PageRank:

```
                    ┌──────────────┐
         ┌────────▶│  read_file   │◀────────┐
         │         │  PageRank:   │         │
         │         │    0.85      │         │
         │         └──────────────┘         │
         │                                  │
┌────────┴───┐                      ┌───────┴────┐
│ process_   │                      │ analyze_   │
│ data       │                      │ content    │
└────────────┘                      └────────────┘
```

`read_file` has high PageRank because many tools depend on it.

### Community Membership

Tools in the same community (cluster) are more likely to work together:

```
┌─────────────────────────────────────────┐
│        Community: File Operations       │
│                                         │
│   read_file    write_file    list_dir   │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│        Community: GitHub                │
│                                         │
│  create_issue   create_pr   push        │
└─────────────────────────────────────────┘
```

If you're using `read_file`, other file tools get a boost.

### Usage Frequency

Tools that are used more often get a small boost:
- Frequently used = likely useful
- Never used = might be less relevant

## Score Fusion

The final score combines both components:

```
Final Score = (α × Semantic Score) + (β × Graph Score)

Where:
  α = 0.7 (semantic weight)
  β = 0.3 (graph weight)
```

This means semantic similarity matters most, but graph signals can boost or demote results.

### Example

Query: "save data"

| Tool | Semantic | Graph | Final |
|------|----------|-------|-------|
| write_file | 0.75 | 0.80 | 0.77 |
| save_json | 0.80 | 0.40 | 0.68 |
| create_backup | 0.60 | 0.90 | 0.69 |

`write_file` wins because it's both semantically relevant AND important in the graph.

### Exemples concrets : L'impact du graph

**Exemple 1 : Popularité et fiabilité**
```
Requête : "créer un projet"
Sémantique seul : project:create (0.89) - nouveau, peu testé
Hybride : project:initialize (0.91) - éprouvé, très utilisé
```
Le graph booste l'outil que la communauté utilise avec succès.

**Exemple 2 : Cohérence de workflow**
```
Contexte : Vous venez d'utiliser git:commit
Requête : "partager le code"
Sémantique seul : share:send_link (0.82)
Hybride : github:push (0.92) - même communauté Git
```
Le graph privilégie les outils cohérents avec votre contexte actuel.

**Exemple 3 : Centralité dans l'écosystème**
```
Requête : "lire des données"
Sémantique seul : data:read_custom (0.85) - spécialisé
Hybride : filesystem:read_file (0.94) - central, fondamental
```
Le graph met en avant les outils sur lesquels d'autres s'appuient (PageRank élevé).

## Benefits

| Pure Semantic | Hybrid |
|---------------|--------|
| Finds relevant tools | Finds relevant AND proven tools |
| No learning | Improves with usage |
| Static results | Dynamic, personalized |

## Pourquoi c'est utile en pratique

**Recommandations intelligentes** : PML suggère les outils qui ont fait leurs preuves, évite les solutions obsolètes, et privilégie ce qui fonctionne dans la communauté.

**Apprentissage continu** : Plus vous utilisez PML, meilleurs deviennent les résultats. Le système apprend quels outils fonctionnent bien ensemble et adapte les suggestions.

**Cohérence contextuelle** : Les suggestions s'adaptent à votre workflow actuel. Si vous travaillez avec Git, PML privilégie les outils Git. Moins de bruit, plus de pertinence.

**Découverte guidée** : Trouvez des outils complémentaires et des workflows optimaux que vous n'auriez pas cherchés. Apprenez les meilleures pratiques naturellement.

**Cas d'usage réel :** Vous cherchez "déployer mon app". La recherche sémantique seule trouverait 10 outils similaires. La recherche hybride met en avant `deploy:kubernetes` car c'est l'outil le plus utilisé dans votre équipe, avec le meilleur taux de succès, qui s'intègre avec vos outils Docker. Gain de temps immédiat.

## Next

- [Proactive Suggestions](./03-proactive-suggestions.md) - Automatic recommendations
- [GraphRAG](../03-learning/01-graphrag.md) - How the graph is built
